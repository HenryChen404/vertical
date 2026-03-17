"""Contact extraction skill — extract contact information from transcript."""

from __future__ import annotations

from services.extraction.base import run_extraction

SYSTEM_PROMPT = """You are a sales AI assistant that extracts contact information from meeting transcripts.

Extract information about people mentioned in the conversation:
- Full name
- Email address if mentioned
- Job title or role
- Phone number if mentioned
- Their role in the deal (e.g., decision maker, champion, end user, technical evaluator)

Only extract information that is explicitly mentioned. Use null for unknown fields.
Return an array of contacts found."""

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "contacts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "Full name"},
                    "email": {"type": "string", "nullable": True, "description": "Email address"},
                    "title": {"type": "string", "nullable": True, "description": "Job title"},
                    "phone": {"type": "string", "nullable": True, "description": "Phone number"},
                    "role_in_deal": {"type": "string", "nullable": True, "description": "Role in the deal"},
                },
                "required": ["name"],
            },
        },
    },
    "required": ["contacts"],
}


async def extract_contacts(transcript: str) -> dict:
    """Extract contact information from transcript."""
    return await run_extraction(transcript, SYSTEM_PROMPT, OUTPUT_SCHEMA)
