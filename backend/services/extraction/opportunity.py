"""Opportunity extraction skill — extract deal/opportunity fields from transcript."""

from __future__ import annotations

from services.extraction.base import run_extraction

SYSTEM_PROMPT = """You are a sales AI assistant that extracts Salesforce Opportunity information from meeting transcripts.

Extract any deal/opportunity-related information mentioned in the conversation:
- Current deal stage (e.g., Prospecting, Qualification, Negotiation, Closed Won)
- Deal amount if mentioned
- Expected close date
- Next steps or action items related to the deal
- Win probability if discussed

Only extract information that is explicitly mentioned or strongly implied. Use null for fields not discussed."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "stage": {"type": "string", "nullable": True, "description": "Salesforce opportunity stage"},
        "amount": {"type": "number", "nullable": True, "description": "Deal amount"},
        "close_date": {"type": "string", "nullable": True, "description": "Expected close date (ISO format)"},
        "next_steps": {"type": "string", "nullable": True, "description": "Next steps or follow-up actions"},
        "probability": {"type": "integer", "nullable": True, "description": "Win probability (0-100)"},
    },
    "required": ["stage", "amount", "close_date", "next_steps", "probability"],
}


async def extract_opportunity(transcript: str) -> dict:
    """Extract opportunity fields from transcript."""
    return await run_extraction(transcript, SYSTEM_PROMPT, OUTPUT_SCHEMA)
