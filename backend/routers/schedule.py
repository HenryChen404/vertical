import asyncio
import json
import logging

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from services.supabase import get_supabase
from services.transcription import transcribe_audio_bytes
from mock_data.schedule import MEETINGS, TRANSCRIPT_LINES

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory feedback storage for mock meetings (resets on restart)
_mock_feedback_store: dict[str, str] = {}


class FeedbackUpdate(BaseModel):
    feedback: str


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


def _format_duration(seconds) -> str:
    """Format seconds to mm:ss string."""
    if not seconds:
        return "0:00"
    m, s = divmod(int(seconds), 60)
    return f"{m}:{s:02d}"


def _fetch_linked_files(db, event_id: str) -> list[dict]:
    """Fetch PLAUD recordings (source_type=1) linked to an event."""
    resp = (
        db.table("recordings")
        .select("id, title, duration_seconds, recorded_at, plaud_file_id")
        .eq("event_id", event_id)
        .eq("source_type", 1)
        .order("created_at")
        .execute()
    )
    return [
        {
            "id": r["id"],
            "title": r.get("title") or "PLAUD File",
            "duration_seconds": r.get("duration_seconds") or 0,
            "recorded_at": r.get("recorded_at"),
            "plaud_file_id": r.get("plaud_file_id"),
        }
        for r in (resp.data or [])
    ]



def _transform_event_to_meeting_detail(event: dict, db=None) -> dict:
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
    # Resolve SF opportunity ID to local deal UUID
    deal_id = ""
    sf_opp_id = opp.get("id", "")
    if sf_opp_id and db:
        try:
            deal_resp = db.table("deals").select("id").eq("external_id", sf_opp_id).execute()
            if deal_resp.data:
                deal_id = deal_resp.data[0]["id"]
        except Exception:
            pass
    opportunity = {
        "id": deal_id,
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
            "title": p.get("title", ""),
            "company": p.get("company", ""),
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
        "feedback": event.get("feedback") or "",
        "linked_files": _fetch_linked_files(db, event["id"]) if db else [],
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
            return _transform_event_to_meeting_detail(resp.data, db=db)
    except Exception:
        pass

    # Fallback to mock data
    meeting = MEETINGS.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    result = {**meeting}
    if meeting_id in _mock_feedback_store:
        result["feedback"] = _mock_feedback_store[meeting_id]
    return result


@router.put("/schedule/{meeting_id}/feedback")
def update_feedback(meeting_id: str, body: FeedbackUpdate):
    # Try to persist in Supabase
    try:
        db = get_supabase()
        resp = db.table("events").select("id").eq("id", meeting_id).execute()
        if resp.data:
            db.table("events").update({"feedback": body.feedback}).eq("id", meeting_id).execute()
            return {"success": True, "feedback": body.feedback}
    except Exception:
        pass

    # Fallback: in-memory for mock meetings
    _mock_feedback_store[meeting_id] = body.feedback
    return {"success": True, "feedback": body.feedback}


@router.post("/schedule/{meeting_id}/feedback/transcribe")
async def transcribe_feedback(meeting_id: str, file: UploadFile = File(...)):
    """Transcribe an audio recording and save as feedback."""
    audio_bytes = await file.read()

    try:
        text = await transcribe_audio_bytes(audio_bytes)
    except Exception as e:
        logger.error("Transcription failed for meeting %s: %s", meeting_id, e)
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")

    # Save feedback
    try:
        db = get_supabase()
        resp = db.table("events").select("id").eq("id", meeting_id).execute()
        if resp.data:
            db.table("events").update({"feedback": text}).eq("id", meeting_id).execute()
        else:
            _mock_feedback_store[meeting_id] = text
    except Exception:
        _mock_feedback_store[meeting_id] = text

    return {"success": True, "feedback": text}


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
