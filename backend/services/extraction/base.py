"""Shared Gemini API call logic for extraction skills."""

from __future__ import annotations

import asyncio
import json
import logging
import os

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

MODEL = "gemini-3-flash-preview"


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


def _sync_generate(
    client: genai.Client,
    user_content: str,
    system_prompt: str,
    output_schema: dict,
) -> str:
    """Synchronous Gemini call (to be run in a thread)."""
    response = client.models.generate_content(
        model=MODEL,
        contents=user_content,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            response_mime_type="application/json",
            response_schema=output_schema,
            temperature=0.2,
        ),
    )
    return response.text


async def run_extraction(
    transcript: str,
    system_prompt: str,
    output_schema: dict,
) -> dict:
    """Call Gemini API with structured output to extract data from transcript.

    Args:
        transcript: The meeting transcript text.
        system_prompt: System instructions for this extraction skill.
        output_schema: JSON schema describing the expected output structure.

    Returns:
        Parsed extraction result as a dict.
    """
    client = _get_client()

    schema_str = json.dumps(output_schema, indent=2)
    user_content = (
        f"Based on the following meeting transcript, extract the relevant information.\n\n"
        f"Output JSON schema:\n```json\n{schema_str}\n```\n\n"
        f"Transcript:\n{transcript}"
    )

    # Run sync Gemini call in a thread to avoid blocking the event loop
    text = await asyncio.to_thread(
        _sync_generate, client, user_content, system_prompt, output_schema
    )

    result = json.loads(text.strip())
    logger.info("Extraction completed: %d fields", len(result))
    return result
