from __future__ import annotations

import logging
from fastapi import APIRouter, Request

from services.sync import sync_events

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/webhooks/composio")
async def composio_webhook(request: Request):
    """Handle Composio webhook for incremental event updates.

    Composio sends webhooks when calendar events are created/updated/deleted.
    We trigger a full sync for simplicity — the sync service handles dedup.
    """
    body = await request.json()
    logger.info("Composio webhook received: %s", body.get("event_type", "unknown"))

    # Trigger sync regardless of event type — sync service is idempotent
    try:
        result = await sync_events(days_ahead=7)
        logger.info("Webhook sync result: %s", result)
        return {"status": "ok", "sync": result}
    except Exception as e:
        logger.error("Webhook sync failed: %s", e)
        return {"status": "error", "detail": str(e)}
