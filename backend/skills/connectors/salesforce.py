"""Salesforce connector — push proposed changes to Salesforce via Composio.

Tool slugs:
- SALESFORCE_SOBJECT_ROWS_UPDATE: update(sobject_api_name, record_id, fields)
- SALESFORCE_CREATE_S_OBJECT_RECORD: create(sobject_type, fields)
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

logger = logging.getLogger(__name__)


async def push_changes(
    proposed_changes: list[dict],
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """Push approved proposed changes to Salesforce (concurrently).

    Args:
        proposed_changes: List of ProposedChange dicts.
        user_id: User ID for Composio connection lookup.

    Returns:
        List of result dicts: [{"change_id": str, "success": bool, "error"?: str}]
    """
    from adapters.salesforce import SalesforceAdapter

    adapter = SalesforceAdapter()
    uid = user_id or adapter._current_user_id
    client, account = adapter._get_client_and_account(uid)

    if not client or not account:
        logger.error("No Salesforce connection available for push")
        return [
            {"change_id": c["id"], "success": False, "error": "No Salesforce connection"}
            for c in proposed_changes
            if c.get("approved")
        ]

    tasks = []
    for change in proposed_changes:
        if not change.get("approved"):
            continue
        fields = {diff["field"]: diff["new"] for diff in change.get("changes", [])}
        if not fields:
            continue
        tasks.append(_push_one(client, account, uid, change, fields))

    if not tasks:
        return []

    return list(await asyncio.gather(*tasks))


async def push_one_change(
    change: dict,
    user_id: str | None = None,
) -> dict[str, Any]:
    """Push a single approved change to Salesforce."""
    from adapters.salesforce import SalesforceAdapter

    if not change.get("approved"):
        return {"change_id": change["id"], "success": True, "error": "Skipped (not approved)"}

    fields = {diff["field"]: diff["new"] for diff in change.get("changes", [])}
    if not fields:
        return {"change_id": change["id"], "success": True}

    adapter = SalesforceAdapter()
    uid = user_id or adapter._current_user_id
    client, account = adapter._get_client_and_account(uid)

    if not client or not account:
        return {"change_id": change["id"], "success": False, "error": "No Salesforce connection"}

    return await _push_one(client, account, uid, change, fields)


async def _push_one(
    client: Any,
    account: Any,
    uid: str,
    change: dict,
    fields: dict,
) -> dict[str, Any]:
    """Push a single change to Salesforce."""
    change_id = change["id"]
    object_type = change["object_type"]
    action = change["action"]

    try:
        t0 = time.time()
        if action == "update" and change.get("record_id"):
            resp = await asyncio.to_thread(
                client.tools.execute,
                slug="SALESFORCE_SOBJECT_ROWS_UPDATE",
                arguments={
                    "sobject_api_name": object_type,
                    "record_id": change["record_id"],
                    "fields": fields,
                },
                connected_account_id=account.id,
                user_id=uid,
                dangerously_skip_version_check=True,
            )
            _check_response(resp, f"Update {object_type} {change['record_id']}")
            ms = int((time.time() - t0) * 1000)
            logger.info("⏱ TIMING [push_record] %s update %s %s — %dms",
                        change_id, object_type, change["record_id"], ms)
            return {"change_id": change_id, "success": True}

        elif action == "create":
            resp = await asyncio.to_thread(
                client.tools.execute,
                slug="SALESFORCE_CREATE_S_OBJECT_RECORD",
                arguments={
                    "sobject_type": object_type,
                    "fields": fields,
                },
                connected_account_id=account.id,
                user_id=uid,
                dangerously_skip_version_check=True,
            )
            _check_response(resp, f"Create {object_type}")
            ms = int((time.time() - t0) * 1000)
            logger.info("⏱ TIMING [push_record] %s create %s — %dms",
                        change_id, object_type, ms)
            return {"change_id": change_id, "success": True}

        else:
            logger.warning(
                "Skipping change %s: action=%s, record_id=%s",
                change_id, action, change.get("record_id"),
            )
            return {"change_id": change_id, "success": False,
                    "error": f"Cannot {action} without record_id"}

    except Exception as e:
        logger.error("Failed to push change %s: %s", change_id, e)
        return {"change_id": change_id, "success": False, "error": str(e)}


def _check_response(resp: Any, context: str) -> None:
    """Check Composio response for errors."""
    data = resp.model_dump() if hasattr(resp, "model_dump") else resp
    if isinstance(data, dict) and data.get("successful") is False:
        error = data.get("error", "Unknown error")
        raise RuntimeError(f"{context} failed: {error}")
