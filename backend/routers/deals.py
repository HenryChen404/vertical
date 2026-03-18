import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from middleware.auth import get_current_user
from services.supabase import get_supabase
from services.sync import sync_deals

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/deals")
async def list_deals(request: Request, user: dict = Depends(get_current_user)):
    """List open deals for the current user."""
    db = get_supabase()
    query = db.table("deals").select("*").order("close_date")
    if user["id"] != "demo_user":
        query = query.eq("user_id", user["id"])
    resp = query.execute()

    # Auto-sync if no deals found
    if not resp.data:
        try:
            await sync_deals(user_id=user["id"])
            resp = query.execute()
        except Exception as e:
            logger.warning("Auto-sync deals failed: %s", e)

    return resp.data or []


@router.get("/deals/{deal_id}")
def get_deal(deal_id: str, request: Request, user: dict = Depends(get_current_user)):
    """Get deal detail with related meetings and recordings."""
    db = get_supabase()
    resp = db.table("deals").select("*").eq("id", deal_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Deal not found")

    deal = resp.data[0]

    # Find related events where sales_details.opportunity.id matches this deal's SF ID
    sf_opp_id = deal.get("external_id", "")
    events_query = db.table("events").select("id, title, start_time, end_time, sales_details, attendees")
    if user["id"] != "demo_user":
        events_query = events_query.eq("user_id", user["id"])
    events_resp = events_query.order("start_time").execute()

    related_meetings = []
    related_event_ids = set()
    for event in (events_resp.data or []):
        sd = event.get("sales_details") or {}
        opp = sd.get("opportunity") or {}
        if opp.get("id") == sf_opp_id:
            # Build subtitle from account or first attendee
            account = sd.get("account") or {}
            subtitle = account.get("name", "")
            if not subtitle and event.get("attendees"):
                first = event["attendees"][0] if event["attendees"] else {}
                subtitle = first.get("name", "")

            related_meetings.append({
                "id": event["id"],
                "title": event["title"],
                "start_time": event["start_time"],
                "end_time": event.get("end_time"),
                "subtitle": subtitle,
            })
            related_event_ids.add(event["id"])

    # Find related recordings via those events
    related_recordings = []
    if related_event_ids:
        for eid in related_event_ids:
            rec_resp = (
                db.table("recordings")
                .select("id, title, recorded_at, duration_seconds")
                .eq("event_id", eid)
                .eq("source_type", 1)
                .execute()
            )
            for r in (rec_resp.data or []):
                related_recordings.append({
                    "id": r["id"],
                    "title": r.get("title", "Recording"),
                    "recorded_at": r.get("recorded_at"),
                    "duration_seconds": r.get("duration_seconds", 0),
                })

    deal["meetings"] = related_meetings
    deal["recordings"] = related_recordings
    return deal


@router.post("/deals/sync")
async def sync_deals_endpoint(request: Request, user: dict = Depends(get_current_user)):
    """Manually trigger a deals sync from Salesforce."""
    result = await sync_deals(user_id=user["id"])
    return result
