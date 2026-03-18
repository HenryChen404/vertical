from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from middleware.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

BUCKET = "recordings"


@router.get("/events/{event_id}/recordings")
def list_recordings(
    event_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """List all recordings attached to an event."""
    db = get_supabase()
    resp = db.table("recordings").select("*").eq("event_id", event_id).order("created_at").execute()
    return resp.data or []


@router.get("/recordings/{recording_id}")
def get_recording(
    recording_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get a single recording's metadata."""
    db = get_supabase()
    resp = db.table("recordings").select("*").eq("id", recording_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Recording not found")
    return resp.data[0]


class LinkRequest(BaseModel):
    event_id: str


@router.post("/recordings/{recording_id}/link")
def link_recording(
    recording_id: str,
    req: LinkRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Manually link a recording to an event."""
    db = get_supabase()

    # Verify recording exists
    rec_resp = db.table("recordings").select("id").eq("id", recording_id).execute()
    if not rec_resp.data:
        raise HTTPException(status_code=404, detail="Recording not found")

    # Verify event exists
    evt_resp = db.table("events").select("id").eq("id", req.event_id).execute()
    if not evt_resp.data:
        raise HTTPException(status_code=404, detail="Event not found")

    db.table("recordings").update({"event_id": req.event_id}).eq("id", recording_id).execute()
    return {"success": True}


@router.post("/recordings/{recording_id}/unlink")
def unlink_recording(
    recording_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Remove a recording's link to its event."""
    db = get_supabase()

    rec_resp = db.table("recordings").select("id").eq("id", recording_id).execute()
    if not rec_resp.data:
        raise HTTPException(status_code=404, detail="Recording not found")

    db.table("recordings").update({"event_id": None}).eq("id", recording_id).execute()
    return {"success": True}


@router.delete("/recordings/{recording_id}")
def delete_recording(
    recording_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Delete a recording and its storage file."""
    db = get_supabase()

    # Fetch recording to get storage path
    resp = db.table("recordings").select("*").eq("id", recording_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Recording not found")

    storage_path = resp.data[0]["storage_path"]

    # Delete from storage
    try:
        db.storage.from_(BUCKET).remove([storage_path])
    except Exception as e:
        logger.warning("Storage delete failed (continuing): %s", e)

    # Delete metadata row
    db.table("recordings").delete().eq("id", recording_id).execute()

    return {"success": True}
