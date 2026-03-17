from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request

from middleware.auth import get_current_user
from services.supabase import get_supabase
from services.sync import sync_events

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/sales/events")
async def list_events(
    request: Request,
    range: str = Query("week", pattern="^(today|tomorrow|week)$"),
    user: dict = Depends(get_current_user),
):
    """Return merged events grouped by time range."""
    # Fire-and-forget PLAUD file sync — don't block event listing
    import asyncio
    from services.plaud_sync import sync_plaud_files
    asyncio.ensure_future(sync_plaud_files(user["id"]))

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

    query = db.table("events").select(
        "*, event_sources(source, source_id)"
    ).gte(
        "start_time", time_min.isoformat()
    ).lt(
        "start_time", time_max.isoformat()
    ).order("start_time")

    # Filter by user_id if not demo
    if user["id"] != "demo_user":
        query = query.eq("user_id", user["id"])

    events_resp = query.execute()
    return {"events": events_resp.data or []}


@router.post("/sales/events/sync")
async def trigger_sync(
    request: Request,
    days_ahead: int = Query(7, ge=1, le=30),
    user: dict = Depends(get_current_user),
):
    """Manually trigger a full sync from all connected sources."""
    result = await sync_events(days_ahead=days_ahead, user_id=user["id"])
    return result


@router.get("/sales/events/{event_id}")
async def get_event(
    event_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get a single merged event with all source details."""
    db = get_supabase()
    query = db.table("events").select(
        "*, event_sources(*)"
    ).eq("id", event_id)

    if user["id"] != "demo_user":
        query = query.eq("user_id", user["id"])

    resp = query.single().execute()
    return resp.data
