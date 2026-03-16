import asyncio
import json

from fastapi import APIRouter, HTTPException
from starlette.responses import StreamingResponse

from services.supabase import get_supabase
from mock_data.schedule import MEETINGS, TRANSCRIPT_LINES

router = APIRouter()


def _format_currency(amount) -> str:
    """Format a number as currency string."""
    if amount is None:
        return ""
    try:
        val = float(amount)
        if val >= 1_000_000:
            return f"${val / 1_000_000:.1f}M"
        if val >= 1_000:
            return f"${val / 1_000:.0f}K"
        return f"${val:,.0f}"
    except (ValueError, TypeError):
        return str(amount)


def _format_date(iso_str: str) -> str:
    """Format ISO datetime to readable date like 'Wed, Mar 20'."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%a, %b %d").replace(" 0", " ")
    except (ValueError, TypeError):
        return iso_str


def _format_time(iso_str: str) -> str:
    """Format ISO datetime to time like '10:00'."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(iso_str)
        return dt.strftime("%H:%M")
    except (ValueError, TypeError):
        return iso_str


def _transform_event_to_meeting_detail(event: dict) -> dict:
    """Transform a Supabase event row into MeetingDetail response format."""
    sales = event.get("sales_details") or {}

    # Account info
    acct = sales.get("account") or {}
    account = {
        "name": acct.get("name", ""),
        "sector": acct.get("industry", ""),
        "annual_revenue": _format_currency(acct.get("annual_revenue")),
    }

    # Opportunity info
    opp = sales.get("opportunity") or {}
    opportunity = {
        "name": opp.get("name", ""),
        "amount": _format_currency(opp.get("amount")),
        "stage": opp.get("stage", ""),
        "close_date": opp.get("close_date", ""),
    }

    # Participants from sales_details + event attendees
    attendees = []
    seen_emails = set()
    for p in sales.get("participants") or []:
        email = p.get("email", "")
        attendees.append({
            "id": p.get("id", ""),
            "name": p.get("name", email),
            "title": "",
            "company": "",
            "status": p.get("status", ""),
        })
        if email:
            seen_emails.add(email.lower())

    for a in event.get("attendees") or []:
        email = a.get("email", "")
        if email.lower() not in seen_emails:
            attendees.append({
                "id": email,
                "name": a.get("name", email),
                "title": a.get("role", ""),
                "company": "",
            })

    return {
        "id": event["id"],
        "title": event.get("title", ""),
        "date": _format_date(event.get("start_time", "")),
        "time_start": _format_time(event.get("start_time", "")),
        "time_end": _format_time(event.get("end_time", "")),
        "location": event.get("location") or "",
        "account": account,
        "opportunity": opportunity,
        "attendees": attendees,
        "feedback": "",
        "linked_files": [],
    }


@router.get("/schedule/{meeting_id}")
def get_meeting(meeting_id: str):
    # First try real data from Supabase
    try:
        db = get_supabase()
        resp = db.table("events").select(
            "*, event_sources(source, source_id)"
        ).eq("id", meeting_id).single().execute()
        if resp.data:
            return _transform_event_to_meeting_detail(resp.data)
    except Exception:
        pass

    # Fallback to mock data
    meeting = MEETINGS.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/schedule/{meeting_id}/recording/start")
def start_recording(meeting_id: str):
    return {"success": True}


@router.post("/schedule/{meeting_id}/recording/stop")
def stop_recording(meeting_id: str):
    return {"success": True}


@router.get("/schedule/{meeting_id}/recording/stream")
async def stream_recording(meeting_id: str):
    async def event_generator():
        for line in TRANSCRIPT_LINES:
            data = {
                "type": "transcript",
                "speaker": line["speaker"],
                "text": line["text"],
                "timestamp": line["timestamp"],
            }
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(2.0)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
