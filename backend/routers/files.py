import asyncio
import os
import logging

from fastapi import APIRouter, Depends, Request
from mock_data.files import RECORDINGS
from middleware.auth import get_current_user
from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/files")
async def list_files(request: Request, user: dict = Depends(get_current_user)):
    """List all recordings. Fire-and-forget PLAUD sync — returns DB data immediately."""
    user_id = user["id"]

    if os.getenv("PLAUD_CLIENT_ID") and user_id != "demo_user":
        # Fire-and-forget: sync runs in background, new files show on next refresh
        from services.plaud_sync import sync_plaud_files
        asyncio.ensure_future(sync_plaud_files(user_id))

        # Return current DB state immediately
        db = get_supabase()
        resp = (
            db.table("recordings")
            .select("id, plaud_file_id, title, duration_seconds, recorded_at, source_type, event_id, crm_sync_status")
            .eq("user_id", user_id)
            .eq("source_type", 1)
            .order("recorded_at", desc=True)
            .execute()
        )
        return resp.data or []

    # Fallback to mock data
    return RECORDINGS
