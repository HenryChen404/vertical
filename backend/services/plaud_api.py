"""PLAUD Files API client — fetches real recording files from PLAUD platform."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx

from services.auth import refresh_plaud_token
from services.supabase import get_supabase

logger = logging.getLogger(__name__)

PLAUD_API_BASE = "https://platform.plaud.ai/developer/api/open/third-party"


async def _get_valid_token(user_id: str) -> str | None:
    """Get a valid PLAUD access token for the user, refreshing if needed."""
    db = get_supabase()
    resp = db.table("users").select(
        "plaud_access_token, plaud_refresh_token, plaud_token_expires_at"
    ).eq("id", user_id).execute()

    if not resp.data:
        return None

    user = resp.data[0]
    access_token = user.get("plaud_access_token")
    refresh_token = user.get("plaud_refresh_token")
    expires_at_str = user.get("plaud_token_expires_at")

    if not access_token:
        return None

    # Check if token is expired (with 5-minute buffer)
    if expires_at_str:
        expires_at = datetime.fromisoformat(expires_at_str)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)
        if now > expires_at - timedelta(minutes=5):
            if not refresh_token:
                logger.warning("Token expired and no refresh token for user %s", user_id)
                return None
            try:
                tokens = await refresh_plaud_token(refresh_token)
                new_access = tokens["access_token"]
                new_refresh = tokens.get("refresh_token", refresh_token)
                new_expires_in = tokens.get("expires_in", 3600)
                new_expires_at = (
                    now + timedelta(seconds=new_expires_in)
                ).isoformat()

                db.table("users").update({
                    "plaud_access_token": new_access,
                    "plaud_refresh_token": new_refresh,
                    "plaud_token_expires_at": new_expires_at,
                }).eq("id", user_id).execute()

                return new_access
            except Exception as e:
                logger.error("Token refresh failed for user %s: %s", user_id, e)
                return None

    return access_token


def _normalize_file(raw: dict) -> dict:
    """Normalize a PLAUD API file object to our RecordingFile schema."""
    # ID
    file_id = str(raw.get("id") or raw.get("fileId") or raw.get("file_id") or "")

    # Title / name
    title = (
        raw.get("title")
        or raw.get("name")
        or raw.get("fileName")
        or raw.get("file_name")
        or "Untitled"
    )

    # Timestamp (ISO string) — prefer start_at (actual recording time) over created_at
    timestamp = (
        raw.get("start_at")
        or raw.get("startAt")
        or raw.get("startTime")
        or raw.get("start_time")
        or raw.get("recordTime")
        or raw.get("record_time")
        or raw.get("recordedAt")
        or raw.get("timestamp")
        or raw.get("created_at")
        or raw.get("createdAt")
        or ""
    )
    # If timestamp is epoch millis (number), convert to ISO
    if isinstance(timestamp, (int, float)) and timestamp > 1e9:
        if timestamp > 1e12:  # milliseconds
            timestamp = datetime.fromtimestamp(timestamp / 1000, tz=timezone.utc).isoformat()
        else:  # seconds
            timestamp = datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()

    # Duration in seconds
    duration = raw.get("duration_seconds") or raw.get("durationSeconds") or raw.get("duration") or 0
    if isinstance(duration, (int, float)):
        # If duration seems to be in milliseconds (> 1 day in seconds = 86400)
        if duration > 86400:
            duration = int(duration / 1000)
        else:
            duration = int(duration)
    else:
        duration = 0

    return {
        "id": file_id,
        "title": title,
        "timestamp": timestamp,
        "duration_seconds": duration,
    }


async def fetch_plaud_files(user_id: str) -> list[dict]:
    """Fetch all recording files from PLAUD API for the given user."""
    token = await _get_valid_token(user_id)
    if not token:
        return []

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{PLAUD_API_BASE}/files/",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info("Raw PLAUD files response keys: %s", list(data.keys()) if isinstance(data, dict) else type(data))

            # Handle nested response
            items = data.get("data", data) if isinstance(data, dict) else data
            if isinstance(items, dict):
                items = items.get("items", items.get("files", items.get("list", [])))
            if not isinstance(items, list):
                items = []

            if items:
                logger.info("Raw PLAUD file item sample: %s", items[0])

            return [_normalize_file(item) for item in items]
    except Exception as e:
        logger.error("Failed to fetch PLAUD files for user %s: %s", user_id, e)
        return []


async def fetch_plaud_file(user_id: str, file_id: str) -> dict | None:
    """Fetch a single file from PLAUD API."""
    token = await _get_valid_token(user_id)
    if not token:
        return None

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{PLAUD_API_BASE}/files/{file_id}",
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", data) if isinstance(data, dict) else data
    except Exception as e:
        logger.error("Failed to fetch PLAUD file %s for user %s: %s", file_id, user_id, e)
        return None
