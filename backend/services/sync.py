from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from adapters.base import NormalizedEvent
from adapters.google_calendar import GoogleCalendarAdapter
from adapters.salesforce import SalesforceAdapter
from services.merge import compute_merge_key, find_merge_candidate, merge_attendees
from services.supabase import get_supabase

logger = logging.getLogger(__name__)

# All adapters to pull from
ADAPTERS = [
    GoogleCalendarAdapter(),
    SalesforceAdapter(),
    # OutlookCalendarAdapter(),
]


async def sync_events(days_ahead: int = 7) -> dict:
    """Full sync: fetch from all sources, merge, upsert to Supabase."""
    now = datetime.now(timezone.utc)
    time_min = now - timedelta(days=1)  # include today's past events
    time_max = now + timedelta(days=days_ahead)

    all_normalized: list[NormalizedEvent] = []
    for adapter in ADAPTERS:
        try:
            logger.info("Sync: fetching from %s (range %s to %s)",
                        type(adapter).__name__, time_min.isoformat(), time_max.isoformat())
            events = await adapter.fetch_events(time_min, time_max)
            logger.info("Sync: %s returned %d events", type(adapter).__name__, len(events))
            all_normalized.extend(events)
        except Exception as e:
            logger.error("Adapter %s failed: %s", type(adapter).__name__, e)

    if not all_normalized:
        logger.info("Sync: no events from any adapter, nothing to do")
        return {"fetched": 0, "merged": 0, "created": 0, "updated": 0}

    db = get_supabase()
    created = 0
    updated = 0

    # Load existing events in the time range for merge matching
    existing_resp = db.table("events").select("*").gte(
        "start_time", time_min.isoformat()
    ).lte("start_time", time_max.isoformat()).execute()
    existing_events = existing_resp.data or []

    for event in all_normalized:
        merge_key = compute_merge_key(event)

        # Check if this exact source event already exists
        source_resp = db.table("event_sources").select("id, event_id").eq(
            "source", event.source
        ).eq("source_id", event.source_id).execute()

        if source_resp.data:
            # Update existing source + merged event
            source_row = source_resp.data[0]
            update_data = {
                "title": event.title,
                "start_time": event.start_time.isoformat(),
                "end_time": event.end_time.isoformat(),
                "location": event.location,
                "description": event.description,
                "attendees": event.attendees,
                "related_deal": event.related_deal,
            }
            if event.sales_details is not None:
                update_data["sales_details"] = event.sales_details
            db.table("events").update(update_data).eq("id", source_row["event_id"]).execute()

            db.table("event_sources").update({
                "raw_data": event.raw_data,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", source_row["id"]).execute()

            updated += 1
            continue

        # Try to find a merge candidate
        candidate = find_merge_candidate(event, existing_events)

        if candidate:
            # Merge into existing event
            merged_attendees = merge_attendees(candidate.get("attendees") or [], event.attendees)
            merge_update = {
                "attendees": merged_attendees,
                "description": event.description or candidate.get("description"),
                "location": event.location or candidate.get("location"),
                "related_deal": event.related_deal or candidate.get("related_deal"),
            }
            if event.sales_details is not None:
                merge_update["sales_details"] = event.sales_details
            elif candidate.get("sales_details"):
                merge_update["sales_details"] = candidate["sales_details"]
            db.table("events").update(merge_update).eq("id", candidate["id"]).execute()

            # Add source link
            db.table("event_sources").insert({
                "event_id": candidate["id"],
                "source": event.source,
                "source_id": event.source_id,
                "raw_data": event.raw_data,
            }).execute()

            updated += 1
        else:
            # Create new merged event
            insert_data = {
                "title": event.title,
                "start_time": event.start_time.isoformat(),
                "end_time": event.end_time.isoformat(),
                "location": event.location,
                "description": event.description,
                "attendees": event.attendees,
                "related_deal": event.related_deal,
                "merge_key": merge_key,
            }
            if event.sales_details is not None:
                insert_data["sales_details"] = event.sales_details
            insert_resp = db.table("events").insert(insert_data).execute()

            merged_id = insert_resp.data[0]["id"]

            db.table("event_sources").insert({
                "event_id": merged_id,
                "source": event.source,
                "source_id": event.source_id,
                "raw_data": event.raw_data,
            }).execute()

            # Add to existing_events for subsequent merge matching
            existing_events.append(insert_resp.data[0])
            created += 1

    return {
        "fetched": len(all_normalized),
        "merged": len(existing_events),
        "created": created,
        "updated": updated,
    }
