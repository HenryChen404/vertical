"""Auto-match unlinked recordings to calendar events by time window."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from services.supabase import get_supabase

logger = logging.getLogger(__name__)

# Match window: recording within [event_start - 5min, event_end + 15min]
PRE_BUFFER = timedelta(minutes=5)
POST_BUFFER = timedelta(minutes=15)


def _parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


def auto_match_recordings(user_id: str) -> int:
    """Match unlinked recordings to events by time window.

    Returns count of newly matched recordings.
    """
    db = get_supabase()

    # Get unlinked recordings (event_id IS NULL)
    rec_query = db.table("recordings").select("id, recorded_at").is_("event_id", "null")
    if user_id != "demo_user":
        rec_query = rec_query.eq("user_id", user_id)
    rec_resp = rec_query.execute()
    unlinked = rec_resp.data or []

    if not unlinked:
        return 0

    # Get all events for this user
    evt_query = db.table("events").select("id, title, start_time, end_time")
    if user_id != "demo_user":
        evt_query = evt_query.eq("user_id", user_id)
    evt_resp = evt_query.execute()
    events = evt_resp.data or []

    if not events:
        return 0

    matched = 0
    for rec in unlinked:
        rec_ts = _parse_iso(rec.get("recorded_at"))
        if not rec_ts:
            continue

        for event in events:
            event_start = _parse_iso(event.get("start_time"))
            event_end = _parse_iso(event.get("end_time"))
            if not event_start or not event_end:
                continue

            if (event_start - PRE_BUFFER) <= rec_ts <= (event_end + POST_BUFFER):
                try:
                    db.table("recordings").update(
                        {"event_id": event["id"]}
                    ).eq("id", rec["id"]).execute()
                    matched += 1
                    logger.info(
                        "Auto-matched recording %s to event %s (%s)",
                        rec["id"], event["id"], event.get("title", ""),
                    )
                except Exception as e:
                    logger.warning("Failed to match recording %s: %s", rec["id"], e)
                break  # One recording matches at most one event

    logger.info("Auto-matching: %d recordings matched for user %s", matched, user_id)
    return matched
