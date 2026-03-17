from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional

from middleware.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

BUCKET = "recordings"


@router.post("/events/{event_id}/recordings/upload")
async def upload_recording(
    event_id: str,
    request: Request,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    duration_seconds: Optional[int] = Form(None),
    user: dict = Depends(get_current_user),
):
    """Upload an audio recording and attach it to an event."""
    db = get_supabase()

    # Verify event exists
    event_resp = db.table("events").select("id").eq("id", event_id).execute()
    if not event_resp.data:
        raise HTTPException(status_code=404, detail="Event not found")

    recording_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "webm"
    storage_path = f"{event_id}/{recording_id}.{ext}"

    # Read file content
    content = await file.read()

    # Upload to Supabase Storage
    try:
        db.storage.from_(BUCKET).upload(
            storage_path,
            content,
            {"content-type": file.content_type or "audio/webm"},
        )
    except Exception as e:
        logger.error("Storage upload failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {e}")

    # Insert metadata row
    row = {
        "id": recording_id,
        "event_id": event_id,
        "source_type": 2,  # local
        "title": title,
        "duration_seconds": duration_seconds,
        "storage_path": storage_path,
    }
    if user["id"] != "demo_user":
        row["user_id"] = user["id"]

    insert_resp = db.table("recordings").insert(row).execute()

    return insert_resp.data[0]


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
