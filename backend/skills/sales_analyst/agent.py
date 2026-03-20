"""Sales analyst agent — transcript analysis and review chat."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

from google import genai
from google.genai import types as genai_types

from skills.sales_analyst.prompts import build_analysis_prompt, build_review_prompt
from skills.sales_analyst.schemas import AnalysisResult
from skills.sales_analyst.tools import REVIEW_TOOL_DECLARATIONS, execute_tool

logger = logging.getLogger(__name__)

MODEL = "gemini-3-flash-preview"


def _get_client() -> genai.Client:
    return genai.Client(api_key=os.getenv("GEMINI_API_KEY"))


# --- Analysis output schema for Gemini structured output ---

_ANALYSIS_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "proposed_changes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Unique ID like chg_1, chg_2"},
                    "object_type": {
                        "type": "string",
                        "description": "Salesforce object: Opportunity, Account, Event, Task, Contact",
                    },
                    "object_name": {
                        "type": "string",
                        "nullable": True,
                        "description": "Display name of the record",
                    },
                    "record_id": {
                        "type": "string",
                        "nullable": True,
                        "description": "Salesforce record ID (null for create)",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["update", "create"],
                    },
                    "changes": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "field": {"type": "string", "description": "Salesforce API field name"},
                                "label": {"type": "string", "description": "Human-readable label"},
                                "old": {
                                    "type": "string",
                                    "nullable": True,
                                    "description": "Current value or null",
                                },
                                "new": {"type": "string", "description": "Proposed new value"},
                            },
                            "required": ["field", "label", "new"],
                        },
                    },
                    "approved": {"type": "boolean"},
                },
                "required": ["id", "object_type", "action", "changes", "approved"],
            },
        },
        "summary": {"type": "string", "description": "1-2 sentence assessment"},
    },
    "required": ["proposed_changes", "summary"],
}


# --- Analysis ---


async def run_analysis(
    transcript: str,
    crm_context: dict[str, Any],
) -> AnalysisResult:
    """Analyze a meeting transcript and propose CRM changes.

    Args:
        transcript: Combined meeting transcript text.
        crm_context: Current CRM state (opportunity, account, participants, event).

    Returns:
        AnalysisResult with proposed_changes and summary.
    """
    client = _get_client()
    system_prompt = build_analysis_prompt(crm_context)

    user_content = (
        "Analyze the following meeting transcript and propose CRM changes.\n\n"
        f"Transcript:\n{transcript}"
    )

    def _call():
        return client.models.generate_content(
            model=MODEL,
            contents=user_content,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                response_schema=_ANALYSIS_OUTPUT_SCHEMA,
                temperature=0.2,
            ),
        )

    t0 = time.time()
    logger.info("Analysis: calling Gemini (prompt ~%d chars, transcript ~%d chars)...",
                len(system_prompt), len(user_content))
    response = await asyncio.to_thread(_call)
    elapsed = time.time() - t0
    result = json.loads(response.text.strip())
    logger.info(
        "Analysis completed in %.1fs: %d proposed changes, ~%d output chars",
        elapsed, len(result.get("proposed_changes", [])), len(response.text),
    )
    return AnalysisResult(**result)


# --- Review chat ---


async def chat_review(
    messages: list[dict],
    proposed_changes: list[dict],
    transcript: str,
) -> dict[str, Any]:
    """Process a user message during review using Gemini with tools.

    Args:
        messages: LLM conversation history [{role, content}, ...].
        proposed_changes: Current proposed changes (will be mutated).
        transcript: Original transcript for context.

    Returns:
        {"proposed_changes": [...], "messages": [...], "should_push": bool}
    """
    client = _get_client()
    system_prompt = build_review_prompt(proposed_changes)
    should_push = False

    # Build Gemini contents
    gemini_contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        gemini_contents.append(
            genai_types.Content(
                role=role,
                parts=[genai_types.Part(text=msg["content"])],
            )
        )

    t0 = time.time()
    logger.info("Chat review: calling Gemini (%d messages)...", len(messages))
    response = await asyncio.to_thread(
        client.models.generate_content,
        model=MODEL,
        contents=gemini_contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=[genai_types.Tool(function_declarations=REVIEW_TOOL_DECLARATIONS)],
            temperature=0.3,
        ),
    )
    elapsed = time.time() - t0
    logger.info("Chat review completed in %.1fs", elapsed)

    assistant_text_parts = []
    for part in response.candidates[0].content.parts:
        if part.text:
            assistant_text_parts.append(part.text)
        elif part.function_call:
            fc = part.function_call
            result = execute_tool(fc.name, dict(fc.args), proposed_changes)
            proposed_changes = result["proposed_changes"]
            if result.get("should_push"):
                should_push = True

    assistant_text = " ".join(assistant_text_parts) if assistant_text_parts else "Changes applied."
    messages.append({"role": "assistant", "content": assistant_text})

    return {
        "proposed_changes": proposed_changes,
        "messages": messages,
        "should_push": should_push,
    }
