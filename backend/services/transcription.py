"""Transcription service — ElevenLabs Scribe v2 via cloud_storage_url."""

from __future__ import annotations

import asyncio
import json
import logging
import os

from elevenlabs import ElevenLabs

from services.plaud_api import fetch_plaud_file
from services.supabase import get_supabase

logger = logging.getLogger(__name__)


elevenlabs_client = ElevenLabs(api_key=os.getenv("ELEVENLABS_API_KEY", ""))


def _sync_transcribe(file_bytes: bytes) -> str:
    """Synchronous ElevenLabs call for raw bytes (to be run in a thread)."""
    result = elevenlabs_client.speech_to_text.convert(
        file=file_bytes,
        model_id="scribe_v2",
    )
    return result.text


async def transcribe_audio_bytes(file_bytes: bytes) -> str:
    """Transcribe raw audio bytes via ElevenLabs Scribe v2.

    Used for feedback voice recording (no storage involved).
    """
    transcript = await asyncio.to_thread(_sync_transcribe, file_bytes)
    logger.info("Transcribed audio bytes: %d chars", len(transcript))
    return transcript


def _sync_transcribe_url(url: str, webhook_metadata: dict | None = None) -> str | None:
    """Synchronous ElevenLabs STT call with cloud_storage_url.

    If webhook_metadata is provided, enables webhook mode (async — ElevenLabs
    will POST the result to the configured webhook).  Otherwise runs
    synchronously and returns the transcript text.
    """
    kwargs: dict = {
        "cloud_storage_url": url,
        "model_id": "scribe_v2",
    }
    if webhook_metadata:
        kwargs["webhook"] = True
        kwargs["webhook_metadata"] = json.dumps(webhook_metadata)
        webhook_id = os.getenv("ELEVENLABS_WEBHOOK_ID")
        if webhook_id:
            kwargs["webhook_id"] = webhook_id

    result = elevenlabs_client.speech_to_text.convert(**kwargs)

    # In webhook mode, the result is a webhook response (no .text) — transcript
    # will arrive via the webhook endpoint later.
    if webhook_metadata:
        return None

    return result.text


async def transcribe_plaud_recording(
    plaud_file_id: str,
    user_id: str,
    *,
    task_id: str | None = None,
    use_webhook: bool = False,
) -> str | None:
    """Fetch PLAUD presigned URL and transcribe via ElevenLabs Scribe v2.

    Args:
        plaud_file_id: PLAUD file ID.
        user_id: User UUID (needed to get PLAUD access token).
        task_id: Optional workflow_task ID — included in webhook_metadata so
            the ElevenLabs webhook can route the result back.
        use_webhook: If True, enable ElevenLabs webhook mode (async).
            The transcript will arrive via the webhook endpoint instead of
            being returned here.

    Returns:
        Transcript text when running synchronously, or None in webhook mode.
    """
    # 1. Get presigned URL from PLAUD
    file_detail = await fetch_plaud_file(user_id, plaud_file_id)
    if not file_detail:
        raise ValueError(f"Could not fetch PLAUD file {plaud_file_id} for user {user_id}")

    presigned_url = file_detail.get("presigned_url")
    if not presigned_url:
        raise ValueError(f"PLAUD file {plaud_file_id} has no presigned_url")

    logger.info("Got presigned_url for PLAUD file %s (user %s)", plaud_file_id, user_id)

    # 2. Call ElevenLabs STT
    metadata = None
    if use_webhook and task_id:
        metadata = {"task_id": task_id, "plaud_file_id": plaud_file_id}

    if use_webhook:
        await asyncio.to_thread(_sync_transcribe_url, presigned_url, metadata)
        logger.info("Triggered ElevenLabs webhook transcription for PLAUD file %s", plaud_file_id)
        return None

    transcript = await asyncio.to_thread(_sync_transcribe_url, presigned_url)
    logger.info("Transcribed PLAUD file %s: %d chars", plaud_file_id, len(transcript))
    return transcript
