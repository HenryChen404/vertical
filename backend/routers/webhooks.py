from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request

from adapters.base import NormalizedEvent
from adapters.google_calendar import GoogleCalendarAdapter
from adapters.salesforce import SalesforceAdapter
from services.merge import compute_merge_key, find_merge_candidate, merge_attendees
from services.supabase import get_supabase
from services.sync import sync_events
from services.workflow import on_task_completed

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


def _verify_webhook_signature(body: bytes, signature_header: str | None) -> bool:
    """Verify Composio webhook HMAC-SHA256 signature.

    Returns True if valid or if no secret is configured (local dev).
    """
    secret = os.getenv("COMPOSIO_WEBHOOK_SECRET")
    if not secret:
        # No secret configured — skip verification (local dev)
        return True
    if not signature_header:
        logger.warning("Webhook request missing signature header")
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    # Composio may send signature as "v1,<hex>" or plain hex
    actual = signature_header.split(",")[-1].strip()
    return hmac.compare_digest(expected, actual)


@router.post("/webhooks/composio")
async def composio_webhook(request: Request):
    """Handle Composio webhook for incremental event updates.

    Composio webhook payload typically contains:
    - event_type: "connection.created" | "connection.deleted" |
                  "trigger.instance.event" etc.
    - data: payload with event details

    For calendar triggers, data contains the calendar event info.
    """
    # Verify signature if COMPOSIO_WEBHOOK_SECRET is set
    raw_body = await request.body()
    signature = request.headers.get("webhook-signature")
    if not _verify_webhook_signature(raw_body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

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


def _resolve_user_id(source: str) -> str | None:
    """Resolve user_id for webhook events via user_integrations mapping."""
    try:
        db = get_supabase()
        # Map webhook source to provider name in user_integrations
        provider_map = {
            "google_calendar": "google",
            "outlook_calendar": "outlook",
            "salesforce": "salesforce",
        }
        provider = provider_map.get(source)
        if provider:
            resp = (
                db.table("user_integrations")
                .select("user_id")
                .eq("provider", provider)
                .eq("connected", True)
                .limit(1)
                .execute()
            )
            if resp.data:
                return resp.data[0]["user_id"]

        # Fallback: pick most recent user
        resp = db.table("users").select("id").order("updated_at", desc=True).limit(1).execute()
        if resp.data:
            return resp.data[0]["id"]
    except Exception as e:
        logger.warning("Failed to resolve user_id for source %s: %s", source, e)
    return None


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

    # Resolve user_id from connected integrations
    user_id = _resolve_user_id(source)

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
        if user_id:
            update_data["user_id"] = user_id
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
    if user_id:
        insert_data["user_id"] = user_id
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

    if sobject == "Opportunity" and record_id:
        return await _handle_salesforce_opportunity_trigger(record_id)

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
    client, account = _salesforce_adapter._get_client_and_account()  # Webhooks use default user
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


async def _handle_salesforce_opportunity_trigger(record_id: str) -> dict:
    """Handle a Salesforce Opportunity update from the Generic SObject trigger."""
    user_id = _resolve_user_id("salesforce")

    opp = _salesforce_adapter.fetch_single_opportunity(
        record_id, user_id=user_id or "demo_user"
    )
    if not opp:
        logger.warning("Could not fetch Opportunity %s", record_id)
        return {"status": "ok", "action": "ignored", "reason": "fetch_failed"}

    db = get_supabase()

    sf_opp_id = opp["id"]

    # If opportunity is closed, remove from deals table
    if opp.get("is_closed"):
        db.table("deals").delete().eq("external_id", sf_opp_id).execute()
        logger.info("Deleted closed deal (sf_id=%s)", sf_opp_id)
        return {"status": "ok", "action": "deleted", "external_id": sf_opp_id}

    # Upsert
    row = {
        "name": opp["name"],
        "amount": opp["amount"],
        "stage": opp["stage"],
        "close_date": opp["close_date"],
        "account": {
            "id": opp.get("account_id", ""),
            "name": opp.get("account_name", ""),
            "revenue": opp.get("account_revenue"),
            "industry": opp.get("account_industry"),
        },
        "contacts": opp.get("contacts", []),
    }
    if user_id:
        row["user_id"] = user_id

    existing = db.table("deals").select("id").eq("external_id", sf_opp_id).execute()
    if existing.data:
        db.table("deals").update(row).eq("external_id", sf_opp_id).execute()
        action = "updated"
        deal_id = existing.data[0]["id"]
    else:
        row["external_id"] = sf_opp_id
        insert_resp = db.table("deals").insert(row).execute()
        deal_id = insert_resp.data[0]["id"]
        action = "created"

    logger.info("Opportunity trigger: %s deal %s (sf_id=%s)", action, deal_id, sf_opp_id)
    return {"status": "ok", "action": action, "deal_id": deal_id}


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


# --- ElevenLabs transcription webhook ---


def _verify_elevenlabs_webhook(body: bytes, signature_header: str | None) -> dict:
    """Verify ElevenLabs webhook signature using the SDK and return the event.

    Raises HTTPException(401) on failure.
    """
    from services.transcription import elevenlabs_client

    secret = os.getenv("ELEVENLABS_WEBHOOK_SECRET")
    if not secret:
        # No secret — skip verification (local dev), just parse JSON
        import json
        return json.loads(body)
    if not signature_header:
        raise HTTPException(status_code=401, detail="Missing elevenlabs-signature header")

    try:
        event = elevenlabs_client.webhooks.construct_event(
            rawBody=body.decode("utf-8"),
            sig_header=signature_header,
            secret=secret,
        )
        return event
    except Exception as e:
        logger.warning("ElevenLabs webhook signature verification failed: %s", e)
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


@router.post("/webhooks/elevenlabs/transcription")
async def elevenlabs_transcription_webhook(request: Request):
    """Handle ElevenLabs STT webhook callback.

    ElevenLabs sends the transcription result to this endpoint when
    webhook=true was set in the original STT request.

    The payload includes:
    - status: "completed" | "failed"
    - text: the transcript (when completed)
    - webhook_metadata: JSON string we passed in the original request,
      containing {"task_id": "...", "plaud_file_id": "..."}
    """
    raw_body = await request.body()
    sig = request.headers.get("elevenlabs-signature")

    event = _verify_elevenlabs_webhook(raw_body, sig)

    # The SDK returns a dict from json.loads(rawBody)
    # Top-level structure: {type, event_timestamp, data: {... actual payload ...}}
    raw_event = event if isinstance(event, dict) else (event.__dict__ if hasattr(event, "__dict__") else await request.json())
    data = raw_event.get("data", raw_event) if isinstance(raw_event, dict) else raw_event

    # Parse metadata to find our task_id
    metadata_raw = data.get("webhook_metadata") or data.get("metadata") or "{}"
    if isinstance(metadata_raw, str):
        import json
        try:
            metadata = json.loads(metadata_raw)
        except json.JSONDecodeError:
            metadata = {}
    else:
        metadata = metadata_raw

    task_id = metadata.get("task_id")
    # ElevenLabs nests the transcript under data.transcription.text
    transcription_obj = data.get("transcription", {})
    status = data.get("status", "").lower()
    transcript = transcription_obj.get("text", "") if isinstance(transcription_obj, dict) else ""


    if not task_id:
        logger.warning("ElevenLabs webhook missing task_id in metadata: %s (full data keys: %s)", metadata, list(data.keys()) if isinstance(data, dict) else "n/a")
        return {"status": "ignored", "reason": "no_task_id"}

    db = get_supabase()

    # Verify task exists and is in TRANSCRIBING state
    task_resp = db.table("workflow_tasks").select("id, workflow_id").eq(
        "id", task_id
    ).eq("state", 1).execute()  # 1 = TRANSCRIBING

    if not task_resp.data:
        logger.warning("No matching transcribing task %s", task_id)
        return {"status": "ignored", "reason": "no_matching_task"}

    task = task_resp.data[0]

    if status == "failed" or not transcript:
        error_msg = data.get("error", "ElevenLabs transcription failed")
        from services.workflow import on_task_failed
        on_task_failed(task_id, error_msg)
        logger.error("ElevenLabs transcription failed for task %s: %s", task_id, error_msg)
        return {"status": "ok", "action": "failed", "task_id": task_id}

    workflow = on_task_completed(task["id"], transcript)
    logger.info("ElevenLabs transcription completed for task %s (%d chars), workflow state=%s",
                task_id, len(transcript), workflow["state"])

    # Save transcript back to recording for future reuse
    db.table("recordings").update({"transcript": transcript}).eq("id", task["recording_id"]).execute()

    # If all tasks done, start analysis
    from services.workflow import WorkflowState
    if workflow["state"] == WorkflowState.EXTRACTING:
        from services.crm_service import run_analysis
        import asyncio
        logger.info("All tasks done for workflow %s (via webhook), starting analysis", workflow["id"])
        asyncio.create_task(run_analysis(workflow["id"]))

    return {"status": "ok", "task_id": task_id}
