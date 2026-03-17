"""Sync PLAUD files: fetch from API, diff against DB, save new ones, trigger auto-match."""

from __future__ import annotations

import asyncio
import logging
import os

from services.supabase import get_supabase

logger = logging.getLogger(__name__)


def _save_new_files(files: list[dict], user_id: str) -> list[dict]:
    """Diff PLAUD files against DB, insert new ones. Returns newly inserted rows."""
    if not files:
        return []

    db = get_supabase()

    # Existing plaud_file_ids for this user
    query = db.table("recordings").select("plaud_file_id").eq("source_type", 1)
    if user_id != "demo_user":
        query = query.eq("user_id", user_id)
    resp = query.execute()
    existing_ids = {row["plaud_file_id"] for row in (resp.data or [])}

    new_files = [f for f in files if str(f["id"]) not in existing_ids]
    if not new_files:
        return []

    rows = []
    for f in new_files:
        row = {
            "source_type": 1,  # plaud
            "plaud_file_id": str(f["id"]),
            "title": f.get("title") or "Untitled",
            "duration_seconds": f.get("duration_seconds") or 0,
            "recorded_at": f.get("timestamp"),
        }
        if user_id != "demo_user":
            row["user_id"] = user_id
        rows.append(row)

    try:
        insert_resp = db.table("recordings").insert(rows).execute()
        logger.info("Saved %d new PLAUD files for user %s", len(rows), user_id)
        return insert_resp.data or []
    except Exception as e:
        logger.error("Failed to save PLAUD files: %s", e)
        return []


def _run_auto_match(user_id: str):
    """Blocking auto-match call (meant to run in executor)."""
    from services.file_matching import auto_match_recordings
    try:
        auto_match_recordings(user_id)
    except Exception as e:
        logger.error("Auto-match failed for user %s: %s", user_id, e)


async def sync_plaud_files(user_id: str) -> list[dict]:
    """Fetch PLAUD files, diff+save new ones, async auto-match.

    Safe to call as fire-and-forget (all exceptions caught).
    Returns the list of newly saved recording rows (empty if nothing new).
    """
    try:
        if not os.getenv("PLAUD_CLIENT_ID") or user_id == "demo_user":
            return []

        from services.plaud_api import fetch_plaud_files
        plaud_files = await fetch_plaud_files(user_id)
        if not plaud_files:
            return []

        new_files = _save_new_files(plaud_files, user_id)

        if new_files:
            asyncio.get_event_loop().run_in_executor(None, _run_auto_match, user_id)

        return new_files
    except Exception as e:
        logger.error("sync_plaud_files failed for user %s: %s", user_id, e)
        return []
