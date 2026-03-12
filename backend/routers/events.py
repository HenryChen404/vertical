from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Query

from services.supabase import get_supabase
from services.sync import sync_events

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/sales/events")
async def list_events(
    range: str = Query("week", pattern="^(today|tomorrow|week)$"),
):
    """Return merged events grouped by time range."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if range == "today":
        time_min = today_start
        time_max = today_start + timedelta(days=1)
    elif range == "tomorrow":
        time_min = today_start + timedelta(days=1)
        time_max = today_start + timedelta(days=2)
    else:  # week
        time_min = today_start
        time_max = today_start + timedelta(days=7)

    db = get_supabase()

    # Fetch merged events with their sources
    events_resp = db.table("events").select(
        "*, event_sources(source, source_id)"
    ).gte(
        "start_time", time_min.isoformat()
    ).lt(
        "start_time", time_max.isoformat()
    ).order("start_time").execute()

    return {"events": events_resp.data or []}


@router.post("/sales/events/sync")
async def trigger_sync(days_ahead: int = Query(7, ge=1, le=30)):
    """Manually trigger a full sync from all connected sources."""
    result = await sync_events(days_ahead=days_ahead)
    return result


@router.get("/sales/events/{event_id}")
async def get_event(event_id: str):
    """Get a single merged event with all source details."""
    db = get_supabase()
    resp = db.table("events").select(
        "*, event_sources(*)"
    ).eq("id", event_id).single().execute()
    return resp.data
