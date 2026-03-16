from __future__ import annotations

import logging
import uuid

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional

from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

BUCKET = "recordings"


@router.post("/events/{event_id}/recordings/upload")
async def upload_recording(
    event_id: str,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    duration_seconds: Optional[int] = Form(None),
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
    file_size = len(content)

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
        "title": title,
        "duration_seconds": duration_seconds,
        "file_size_bytes": file_size,
        "storage_path": storage_path,
    }
    insert_resp = db.table("recordings").insert(row).execute()

    return insert_resp.data[0]


@router.get("/events/{event_id}/recordings")
def list_recordings(event_id: str):
    """List all recordings attached to an event."""
    db = get_supabase()
    resp = db.table("recordings").select("*").eq("event_id", event_id).order("created_at").execute()
    return resp.data or []


@router.get("/recordings/{recording_id}")
def get_recording(recording_id: str):
    """Get a single recording's metadata."""
    db = get_supabase()
    resp = db.table("recordings").select("*").eq("id", recording_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Recording not found")
    return resp.data[0]


@router.delete("/recordings/{recording_id}")
def delete_recording(recording_id: str):
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
