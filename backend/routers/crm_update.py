from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from models.schemas import UnsyncedRecording, CrmChangeProposal, CrmUpdateProgress, CrmChangeSection
from mock_data.crm_update import UNSYNCED_RECORDINGS, CRM_PROPOSAL
from middleware.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter()


@router.get("/crm-update/recordings")
def get_unsynced_recordings(request: Request, user: dict = Depends(get_current_user)):
    """Return recordings with crm_sync_status=1 (not synced)."""
    user_id = user["id"]

    if user_id == "demo_user":
        return UNSYNCED_RECORDINGS

    db = get_supabase()
    resp = (
        db.table("recordings")
        .select("id, title, duration_seconds, recorded_at, event_id")
        .eq("user_id", user_id)
        .eq("crm_sync_status", 1)
        .order("recorded_at", desc=True)
        .execute()
    )
    rows = resp.data or []

    # Collect event_ids to batch-fetch sales_details
    event_ids = list({r["event_id"] for r in rows if r.get("event_id")})
    events_map: dict[str, dict] = {}
    if event_ids:
        ev_resp = (
            db.table("events")
            .select("id, sales_details")
            .in_("id", event_ids)
            .execute()
        )
        for ev in ev_resp.data or []:
            events_map[ev["id"]] = ev.get("sales_details") or {}

    # Format each recording
    result = []
    for r in rows:
        # Format date
        date_str = ""
        if r.get("recorded_at"):
            from datetime import datetime, timezone
            try:
                dt = datetime.fromisoformat(r["recorded_at"].replace("Z", "+00:00"))
                now = datetime.now(timezone.utc)
                diff_days = (now.date() - dt.date()).days
                time_str = dt.strftime("%-H:%M")
                if diff_days == 0:
                    date_str = f"Today at {time_str}"
                elif diff_days == 1:
                    date_str = f"Yesterday at {time_str}"
                else:
                    date_str = dt.strftime("%b %d") + f" at {time_str}"
            except Exception:
                date_str = r["recorded_at"]

        # Format duration
        dur_str = ""
        secs = r.get("duration_seconds") or 0
        if secs > 0:
            h, m = divmod(secs // 60, 60)
            if h > 0:
                dur_str = f"{h}h {m:02d}m"
            else:
                dur_str = f"{m} min"

        # Build crm_tags from event sales_details
        crm_tags = []
        sales = events_map.get(r.get("event_id", ""), {})
        acct = sales.get("account") or {}
        if acct.get("name"):
            crm_tags.append({"label": acct["name"], "type": "account"})
        opp = sales.get("opportunity") or {}
        if opp.get("name"):
            crm_tags.append({"label": opp["name"], "type": "opportunity"})

        result.append({
            "id": r["id"],
            "title": r["title"],
            "date": date_str,
            "duration": dur_str,
            "selected": False,
            "crm_tags": crm_tags,
        })

    return result


class AnalyzeRequest(BaseModel):
    recording_ids: list[str]


@router.post("/crm-update/analyze", response_model=CrmChangeProposal)
def analyze_recordings(req: AnalyzeRequest):
    return CRM_PROPOSAL


class ConfirmRequest(BaseModel):
    session_id: str
    category: str


@router.post("/crm-update/confirm")
def confirm_section(req: ConfirmRequest):
    return {"success": True}


class ConfirmAllRequest(BaseModel):
    session_id: str


@router.post("/crm-update/confirm-all")
def confirm_all(req: ConfirmAllRequest):
    return {"success": True}


class SaveChangesRequest(BaseModel):
    session_id: str
    sections: list[CrmChangeSection]


@router.put("/crm-update/changes")
def save_changes(req: SaveChangesRequest):
    return {"success": True}


class ApplyRequest(BaseModel):
    session_id: str


@router.post("/crm-update/apply")
def apply_changes(req: ApplyRequest):
    return {"success": True}


@router.get("/crm-update/status", response_model=CrmUpdateProgress)
def get_status(session_id: str):
    return {
        "total": 5,
        "completed": 5,
        "current_item": "Complete",
        "status": "done",
    }
