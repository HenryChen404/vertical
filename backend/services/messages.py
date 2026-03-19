"""Workflow message service — CRUD for conversational workflow messages."""

from __future__ import annotations

import logging
from enum import IntEnum

from services.supabase import get_supabase

logger = logging.getLogger(__name__)


class MessageRole(IntEnum):
    USER = 0
    ASSISTANT = 1


def add_message(workflow_id: str, role: MessageRole, content: dict) -> dict:
    """Insert a new message and return it."""
    db = get_supabase()
    resp = db.table("workflow_messages").insert({
        "workflow_id": workflow_id,
        "role": role,
        "content": content,
    }).execute()
    return resp.data[0]


def get_messages(workflow_id: str) -> list[dict]:
    """Get all messages for a workflow, ordered by creation time."""
    db = get_supabase()
    resp = db.table("workflow_messages").select("*").eq(
        "workflow_id", workflow_id
    ).order("created_at").execute()
    return resp.data


def update_message(message_id: str, content: dict) -> dict:
    """Update a message's content."""
    db = get_supabase()
    resp = db.table("workflow_messages").update({
        "content": content,
    }).eq("id", message_id).execute()
    return resp.data[0]
