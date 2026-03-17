"""Account extraction skill — extract company/account information from transcript."""

from __future__ import annotations

from services.extraction.base import run_extraction

SYSTEM_PROMPT = """You are a sales AI assistant that extracts company/account information from meeting transcripts.

Extract any company-related information mentioned in the conversation:
- Company name
- Industry
- Annual revenue or company size if mentioned
- Key insights (competitive intelligence, industry trends, pain points, strategic priorities)

Only extract information that is explicitly mentioned or strongly implied. Use null for unknown fields."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "nullable": True, "description": "Company name"},
        "industry": {"type": "string", "nullable": True, "description": "Industry"},
        "annual_revenue": {"type": "number", "nullable": True, "description": "Annual revenue"},
        "key_insights": {"type": "string", "nullable": True, "description": "Key business insights from the conversation"},
    },
    "required": ["name", "industry", "annual_revenue", "key_insights"],
}


async def extract_account(transcript: str) -> dict:
    """Extract account information from transcript."""
    return await run_extraction(transcript, SYSTEM_PROMPT, OUTPUT_SCHEMA)
