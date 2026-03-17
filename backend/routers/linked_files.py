from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)


class LinkFileRequest(BaseModel):
    plaud_file_id: str
    title: str | None = None
    duration_seconds: int | None = None


@router.get("/events/{event_id}/linked-files")
def list_linked_files(event_id: str):
    """List all PLAUD files linked to an event."""
    db = get_supabase()
    resp = (
        db.table("event_file_links")
        .select("*")
        .eq("event_id", event_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


@router.post("/events/{event_id}/linked-files")
def link_file(event_id: str, req: LinkFileRequest):
    """Link a PLAUD file to an event."""
    db = get_supabase()

    # Verify event exists
    event_resp = db.table("events").select("id").eq("id", event_id).execute()
    if not event_resp.data:
        raise HTTPException(status_code=404, detail="Event not found")

    # Insert link (unique constraint prevents duplicates)
    try:
        row = {
            "event_id": event_id,
            "plaud_file_id": req.plaud_file_id,
        }
        if req.title:
            row["title"] = req.title
        if req.duration_seconds is not None:
            row["duration_seconds"] = req.duration_seconds
        resp = db.table("event_file_links").insert(row).execute()
    except Exception as e:
        error_str = str(e)
        if "duplicate" in error_str.lower() or "unique" in error_str.lower():
            raise HTTPException(status_code=409, detail="File already linked to this event")
        raise HTTPException(status_code=500, detail=f"Failed to link file: {e}")

    return resp.data[0]


@router.delete("/events/{event_id}/linked-files/{link_id}")
def unlink_file(event_id: str, link_id: str):
    """Remove a PLAUD file link from an event."""
    db = get_supabase()

    resp = (
        db.table("event_file_links")
        .delete()
        .eq("id", link_id)
        .eq("event_id", event_id)
        .execute()
    )

    if not resp.data:
        raise HTTPException(status_code=404, detail="Link not found")

    return {"success": True}
