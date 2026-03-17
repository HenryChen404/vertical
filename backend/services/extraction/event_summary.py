"""Event summary extraction skill — extract meeting summary and action items."""

from __future__ import annotations

from services.extraction.base import run_extraction

SYSTEM_PROMPT = """You are a sales AI assistant that generates meeting summaries from transcripts.

Create a concise summary of the meeting including:
- A 1-2 paragraph summary of what was discussed
- Key decisions that were made
- Action items with assignees and due dates if mentioned

Focus on information relevant to sales and business relationships."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string", "description": "1-2 paragraph meeting summary"},
        "key_decisions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Key decisions made during the meeting",
        },
        "action_items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "task": {"type": "string", "description": "Action item description"},
                    "assignee": {"type": "string", "nullable": True, "description": "Person responsible"},
                    "due_date": {"type": "string", "nullable": True, "description": "Due date (ISO format)"},
                },
                "required": ["task"],
            },
            "description": "Action items from the meeting",
        },
    },
    "required": ["summary", "key_decisions", "action_items"],
}


async def extract_event_summary(transcript: str) -> dict:
    """Extract meeting summary and action items from transcript."""
    return await run_extraction(transcript, SYSTEM_PROMPT, OUTPUT_SCHEMA)
