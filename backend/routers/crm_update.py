from fastapi import APIRouter
from pydantic import BaseModel
from models.schemas import UnsyncedRecording, CrmChangeProposal, CrmUpdateProgress, CrmChangeSection
from mock_data.crm_update import UNSYNCED_RECORDINGS, CRM_PROPOSAL

router = APIRouter()


@router.get("/crm-update/recordings", response_model=list[UnsyncedRecording])
def get_unsynced_recordings():
    return UNSYNCED_RECORDINGS


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
