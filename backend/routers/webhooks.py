from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request

from adapters.base import NormalizedEvent
from adapters.google_calendar import GoogleCalendarAdapter
from adapters.salesforce import SalesforceAdapter
from services.merge import compute_merge_key, find_merge_candidate, merge_attendees
from services.supabase import get_supabase
from services.sync import sync_events

router = APIRouter()
logger = logging.getLogger(__name__)

# Source mapping: Composio app name → our source string
APP_TO_SOURCE = {
    "googlecalendar": "google_calendar",
    "outlookcalendar": "outlook_calendar",
    "salesforce": "salesforce",
}

# Adapter instances for single-event normalization
_google_adapter = GoogleCalendarAdapter()
_salesforce_adapter = SalesforceAdapter()


@router.post("/webhooks/composio")
async def composio_webhook(request: Request):
    """Handle Composio webhook for incremental event updates.

    Composio webhook payload typically contains:
    - event_type: "connection.created" | "connection.deleted" |
                  "trigger.instance.event" etc.
    - data: payload with event details

    For calendar triggers, data contains the calendar event info.
    """
    body = await request.json()
    event_type = body.get("event_type", body.get("type", "unknown"))
    data = body.get("data", body.get("payload", {}))

    logger.info("Composio webhook: type=%s", event_type)

    # Route based on event type — check "trigger" first since trigger
    # event_types like "trigger.instance.updated" also match "updated"
    if "trigger" in event_type:
        return await _handle_trigger_event(data)
    elif "deleted" in event_type or "cancelled" in event_type or "removed" in event_type:
        return await _handle_delete(data)
    elif "created" in event_type or "updated" in event_type or "modified" in event_type:
        return await _handle_upsert(data)
    else:
        # Fallback: full sync for unknown event types
        logger.info("Unknown webhook type '%s', triggering full sync", event_type)
        result = await sync_events(days_ahead=7)
        return {"status": "ok", "action": "full_sync", "sync": result}


async def _handle_upsert(data: dict) -> dict:
    """Handle event creation or update from webhook payload."""
    source, source_id, event_data = _extract_event_info(data)
    if not source or not source_id:
        logger.warning("Cannot extract event info from upsert webhook, falling back to full sync")
        result = await sync_events(days_ahead=7)
        return {"status": "ok", "action": "full_sync", "sync": result}

    # Normalize the event
    normalized = _normalize_webhook_event(source, source_id, event_data)
    if not normalized:
        logger.warning("Cannot normalize webhook event, falling back to full sync")
        result = await sync_events(days_ahead=7)
        return {"status": "ok", "action": "full_sync", "sync": result}

    # Enrich with related entities (Account, Opportunity, Participants)
    sales_details = _enrich_salesforce_event(source, source_id, event_data)

    db = get_supabase()

    # Check if this source event already exists
    source_resp = db.table("event_sources").select("id, event_id").eq(
        "source", source
    ).eq("source_id", source_id).execute()

    if source_resp.data:
        # Update existing
        source_row = source_resp.data[0]
        update_data = {
            "title": normalized.title,
            "start_time": normalized.start_time.isoformat(),
            "end_time": normalized.end_time.isoformat(),
            "location": normalized.location,
            "description": normalized.description,
            "attendees": normalized.attendees,
            "related_deal": normalized.related_deal,
        }
        if sales_details:
            update_data["sales_details"] = sales_details
        db.table("events").update(update_data).eq("id", source_row["event_id"]).execute()

        db.table("event_sources").update({
            "raw_data": normalized.raw_data,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", source_row["id"]).execute()

        logger.info("Updated event %s from %s/%s", source_row["event_id"], source, source_id)
        return {"status": "ok", "action": "updated", "event_id": source_row["event_id"]}

    # New event — check for merge candidate
    existing_resp = db.table("events").select("*").gte(
        "start_time", (normalized.start_time.replace(hour=0, minute=0, second=0)).isoformat()
    ).lt(
        "start_time", (normalized.end_time.replace(hour=23, minute=59, second=59)).isoformat()
    ).execute()
    existing_events = existing_resp.data or []

    candidate = find_merge_candidate(normalized, existing_events)

    if candidate:
        merged_attendees = merge_attendees(candidate.get("attendees") or [], normalized.attendees)
        merge_update = {
            "attendees": merged_attendees,
            "description": normalized.description or candidate.get("description"),
            "location": normalized.location or candidate.get("location"),
            "related_deal": normalized.related_deal or candidate.get("related_deal"),
        }
        if sales_details:
            merge_update["sales_details"] = sales_details
        elif candidate.get("sales_details"):
            merge_update["sales_details"] = candidate["sales_details"]
        db.table("events").update(merge_update).eq("id", candidate["id"]).execute()

        db.table("event_sources").insert({
            "event_id": candidate["id"],
            "source": normalized.source,
            "source_id": normalized.source_id,
            "raw_data": normalized.raw_data,
        }).execute()

        logger.info("Merged event into %s from %s/%s", candidate["id"], source, source_id)
        return {"status": "ok", "action": "merged", "event_id": candidate["id"]}

    # Create new
    merge_key = compute_merge_key(normalized)
    insert_data = {
        "title": normalized.title,
        "start_time": normalized.start_time.isoformat(),
        "end_time": normalized.end_time.isoformat(),
        "location": normalized.location,
        "description": normalized.description,
        "attendees": normalized.attendees,
        "related_deal": normalized.related_deal,
        "merge_key": merge_key,
    }
    if sales_details:
        insert_data["sales_details"] = sales_details
    insert_resp = db.table("events").insert(insert_data).execute()

    event_id = insert_resp.data[0]["id"]

    db.table("event_sources").insert({
        "event_id": event_id,
        "source": normalized.source,
        "source_id": normalized.source_id,
        "raw_data": normalized.raw_data,
    }).execute()

    logger.info("Created event %s from %s/%s", event_id, source, source_id)
    return {"status": "ok", "action": "created", "event_id": event_id}


async def _handle_delete(data: dict) -> dict:
    """Handle event deletion from webhook payload.

    Strategy:
    1. Find the event_source row by source + source_id
    2. Delete the event_source row
    3. If the merged event has no remaining sources, delete it too
    """
    source, source_id, _ = _extract_event_info(data)
    if not source or not source_id:
        logger.warning("Cannot extract event info from delete webhook")
        return {"status": "ok", "action": "ignored", "reason": "no_event_info"}

    db = get_supabase()

    # Find the source record
    source_resp = db.table("event_sources").select("id, event_id").eq(
        "source", source
    ).eq("source_id", source_id).execute()

    if not source_resp.data:
        logger.info("No source record found for %s/%s, nothing to delete", source, source_id)
        return {"status": "ok", "action": "ignored", "reason": "not_found"}

    source_row = source_resp.data[0]
    event_id = source_row["event_id"]

    # Delete the source record
    db.table("event_sources").delete().eq("id", source_row["id"]).execute()
    logger.info("Deleted source %s/%s from event %s", source, source_id, event_id)

    # Check if merged event has any remaining sources
    remaining_resp = db.table("event_sources").select("id").eq(
        "event_id", event_id
    ).execute()

    if not remaining_resp.data:
        # No more sources — delete the merged event
        db.table("events").delete().eq("id", event_id).execute()
        logger.info("Deleted orphan merged event %s (no remaining sources)", event_id)
        return {"status": "ok", "action": "deleted", "event_id": event_id}

    return {"status": "ok", "action": "source_removed", "event_id": event_id}


async def _handle_trigger_event(data: dict) -> dict:
    """Handle Composio trigger events (e.g. calendar change notifications).

    For the Generic SObject trigger, the payload structure is:
    {
      "sobject": "Event",
      "id": "00U...",
      "monitored_values": {"Subject": "...", "StartDateTime": "...", ...},
      ...
    }

    We need to fetch the full Event record + related entities via SOQL.
    """
    # Check if this is a cancellation/deletion
    status = data.get("status", "").lower()
    if status in ("cancelled", "deleted"):
        return await _handle_delete(data)

    # Handle Generic SObject trigger for Salesforce Event
    sobject = data.get("sobject", "")
    record_id = data.get("id", "")
    if sobject == "Event" and record_id:
        return await _handle_salesforce_event_trigger(record_id)

    # Try as standard upsert
    source, source_id, _ = _extract_event_info(data)
    if source and source_id:
        return await _handle_upsert(data)

    # Can't parse — full sync
    logger.info("Cannot parse trigger event, triggering full sync")
    result = await sync_events(days_ahead=7)
    return {"status": "ok", "action": "full_sync", "sync": result}


async def _handle_salesforce_event_trigger(record_id: str) -> dict:
    """Handle a Salesforce Event update from the Generic SObject trigger.

    Fetches the full Event record with relationships via SOQL, then upserts.
    """
    client, account = _salesforce_adapter._get_client_and_account()
    if not client or not account:
        logger.warning("No Salesforce connection for event enrichment, falling back to full sync")
        result = await sync_events(days_ahead=7)
        return {"status": "ok", "action": "full_sync", "sync": result}

    # Fetch the full Event record with relationships
    soql = (
        "SELECT Id, Subject, StartDateTime, EndDateTime, Location, Description, "
        "WhoId, WhatId, Who.Name, Who.Email, What.Name, What.Type, "
        "OwnerId, Owner.Name, Owner.Email "
        f"FROM Event WHERE Id = '{record_id}'"
    )
    raw = _salesforce_adapter._execute_soql(client, account, soql)
    if not raw or not raw.get("records"):
        logger.warning("Could not fetch Event %s, falling back to full sync", record_id)
        result = await sync_events(days_ahead=7)
        return {"status": "ok", "action": "full_sync", "sync": result}

    record = raw["records"][0]

    # Build a data dict that _extract_event_info and _handle_upsert can process
    enriched_data = {
        "app": "salesforce",
        **record,
    }

    return await _handle_upsert(enriched_data)


def _enrich_salesforce_event(source: str, source_id: str, event_data: dict) -> dict | None:
    """Fetch related entities (Account, Opportunity, Participants) for a Salesforce event."""
    if source != "salesforce":
        return None
    try:
        client, account = _salesforce_adapter._get_client_and_account()
        if not client or not account:
            return None
        # Build a minimal record with Id and What info for the adapter
        record = {"Id": source_id, **event_data}
        return _salesforce_adapter.fetch_related_for_event(client, account, record)
    except Exception as e:
        logger.warning("Failed to enrich Salesforce event %s: %s", source_id, e)
        return None


def _extract_event_info(data: dict) -> tuple[str | None, str | None, dict]:
    """Extract source, source_id, and raw event data from webhook payload.

    Composio webhook payloads vary by trigger type. Common structures:
    - data.event.id, data.app (trigger payloads)
    - data.id, data.source (direct event payloads)
    - data.payload.id (nested payloads)
    """
    # Try to determine the source app
    app = data.get("app", data.get("appName", "")).lower()
    source = APP_TO_SOURCE.get(app)

    # Try nested payload structures
    event_data = data.get("event", data.get("payload", data))

    # If source not found from app field, try from event data
    if not source:
        event_source = event_data.get("source", "").lower()
        if event_source in APP_TO_SOURCE.values():
            source = event_source
        # Infer from organizer email domain or other hints
        elif "googlecalendar" in str(data).lower() or "google" in str(data).lower():
            source = "google_calendar"
        elif "outlook" in str(data).lower():
            source = "outlook_calendar"

    # Extract source_id (Salesforce uses capital "Id", others use "id")
    source_id = (
        event_data.get("id")
        or event_data.get("Id")
        or event_data.get("eventId")
        or event_data.get("source_id")
        or data.get("id")
        or data.get("Id")
    )

    if not source or not source_id:
        logger.debug("_extract_event_info failed: source=%s, source_id=%s, keys=%s",
                      source, source_id, list(data.keys()))

    return source, source_id, event_data


def _normalize_webhook_event(source: str, source_id: str, data: dict) -> NormalizedEvent | None:
    """Normalize a raw webhook event payload into our standard format."""
    try:
        # Google Calendar format
        if source == "google_calendar":
            return _google_adapter._normalize({**data, "id": source_id})

        # Salesforce format
        if source == "salesforce":
            return _salesforce_adapter._normalize({**data, "Id": source_id})

        # Generic fallback
        start = data.get("start", {})
        end = data.get("end", {})

        start_time = _parse_webhook_time(start) if isinstance(start, dict) else _parse_webhook_time_str(start)
        end_time = _parse_webhook_time(end) if isinstance(end, dict) else _parse_webhook_time_str(end)

        if not start_time or not end_time:
            return None

        attendees = []
        for a in data.get("attendees", []):
            attendees.append({
                "email": a.get("email", ""),
                "name": a.get("displayName", a.get("name", a.get("email", ""))),
                "role": "organizer" if a.get("organizer") else "attendee",
            })

        return NormalizedEvent(
            source=source,
            source_id=source_id,
            title=data.get("summary", data.get("title", data.get("subject", "Untitled"))),
            start_time=start_time,
            end_time=end_time,
            attendees=attendees,
            description=data.get("description"),
            location=data.get("location"),
            raw_data=data,
        )
    except Exception as e:
        logger.error("Failed to normalize webhook event: %s", e)
        return None


def _parse_webhook_time(time_obj: dict) -> datetime | None:
    """Parse time from Google Calendar format {dateTime: ...} or {date: ...}."""
    try:
        if "dateTime" in time_obj:
            return datetime.fromisoformat(time_obj["dateTime"])
        if "date" in time_obj:
            return datetime.fromisoformat(time_obj["date"])
    except (ValueError, TypeError):
        pass
    return None


def _parse_webhook_time_str(val) -> datetime | None:
    """Parse a datetime string."""
    if not val:
        return None
    try:
        return datetime.fromisoformat(str(val))
    except (ValueError, TypeError):
        return None
