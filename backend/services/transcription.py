"""Transcription service — ElevenLabs Scribe v2 for local, PLAUD API for PLAUD recordings."""

from __future__ import annotations

import asyncio
import logging
import os

import httpx
from elevenlabs import ElevenLabs

from services.supabase import get_supabase

logger = logging.getLogger(__name__)


elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY", ""))


def _sync_transcribe(file_bytes: bytes) -> str:
    """Synchronous ElevenLabs call (to be run in a thread)."""
    client = elevenlabs_client
    result = client.speech_to_text.convert(
        file=file_bytes,
        model_id="scribe_v2",
    )
    return result.text


async def transcribe_audio_bytes(file_bytes: bytes) -> str:
    """Transcribe raw audio bytes via ElevenLabs Scribe v2.

    Used for feedback voice recording (no Supabase storage involved).
    """
    transcript = await asyncio.to_thread(_sync_transcribe, file_bytes)
    logger.info("Transcribed audio bytes: %d chars", len(transcript))
    return transcript


async def transcribe_local(recording_id: str) -> str:
    """Download recording from Supabase Storage, transcribe via ElevenLabs Scribe v2.

    Args:
        recording_id: UUID of the recording in the recordings table.

    Returns:
        Transcribed text.
    """
    db = get_supabase()

    # Get recording metadata
    rec_resp = db.table("recordings").select("*").eq("id", recording_id).execute()
    if not rec_resp.data:
        raise ValueError(f"Recording {recording_id} not found")
    recording = rec_resp.data[0]

    storage_path = recording.get("storage_path")
    if not storage_path:
        raise ValueError(f"Recording {recording_id} has no storage_path")

    # Download from Supabase Storage
    bucket = "recordings"
    file_bytes = db.storage.from_(bucket).download(storage_path)

    # Run sync ElevenLabs call in a thread to avoid blocking the event loop
    transcript = await asyncio.to_thread(_sync_transcribe, file_bytes)

    logger.info("Transcribed local recording %s: %d chars", recording_id, len(transcript))
    return transcript


async def trigger_plaud_transcription(plaud_file_id: str) -> None:
    """Trigger transcription via PLAUD API (async, result comes via webhook).

    Args:
        plaud_file_id: PLAUD file ID (e.g. "plaud_file_xxx").
    """
    plaud_api_base = os.getenv("PLAUD_API_BASE", "https://api.plaud.ai")
    plaud_api_key = os.getenv("PLAUD_API_KEY", "")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{plaud_api_base}/v1/files/{plaud_file_id}/transcribe",
            headers={"Authorization": f"Bearer {plaud_api_key}"},
            json={"webhook_url": os.getenv("PLAUD_WEBHOOK_URL", "")},
        )
        resp.raise_for_status()
        logger.info("Triggered PLAUD transcription for %s", plaud_file_id)


async def fetch_plaud_transcript(plaud_file_id: str) -> str | None:
    """Fetch transcript from PLAUD API if already completed.

    Returns:
        Transcript text, or None if not ready.
    """
    plaud_api_base = os.getenv("PLAUD_API_BASE", "https://api.plaud.ai")
    plaud_api_key = os.getenv("PLAUD_API_KEY", "")

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{plaud_api_base}/v1/files/{plaud_file_id}/transcript",
            headers={"Authorization": f"Bearer {plaud_api_key}"},
        )
        if resp.status_code == 404:
            return None
        resp.raise_for_status()
        data = resp.json()
        return data.get("transcript")
