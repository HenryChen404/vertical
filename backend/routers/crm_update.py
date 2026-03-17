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
    return resp.data or []


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
