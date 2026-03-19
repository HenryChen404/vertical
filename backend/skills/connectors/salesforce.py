"""Salesforce connector — push proposed changes to Salesforce via Composio.

Tool slugs:
- SALESFORCE_SOBJECT_ROWS_UPDATE: update(sobject_api_name, record_id, fields)
- SALESFORCE_CREATE_S_OBJECT_RECORD: create(sobject_type, fields)
"""

from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


async def push_changes(
    proposed_changes: list[dict],
    user_id: str | None = None,
) -> list[dict[str, Any]]:
    """Push approved proposed changes to Salesforce.

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

    results = []
    for change in proposed_changes:
        if not change.get("approved"):
            continue

        change_id = change["id"]
        object_type = change["object_type"]
        action = change["action"]
        fields = {diff["field"]: diff["new"] for diff in change.get("changes", [])}

        if not fields:
            continue

        try:
            if action == "update" and change.get("record_id"):
                resp = client.tools.execute(
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
                logger.info("Updated %s %s", object_type, change["record_id"])
                results.append({"change_id": change_id, "success": True})

            elif action == "create":
                resp = client.tools.execute(
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
                logger.info("Created %s", object_type)
                results.append({"change_id": change_id, "success": True})

            else:
                logger.warning(
                    "Skipping change %s: action=%s, record_id=%s",
                    change_id, action, change.get("record_id"),
                )
                results.append({
                    "change_id": change_id,
                    "success": False,
                    "error": f"Cannot {action} without record_id",
                })

        except Exception as e:
            logger.error("Failed to push change %s: %s", change_id, e)
            results.append({"change_id": change_id, "success": False, "error": str(e)})

    return results


def _check_response(resp: Any, context: str) -> None:
    """Check Composio response for errors."""
    data = resp.model_dump() if hasattr(resp, "model_dump") else resp
    if isinstance(data, dict) and data.get("successful") is False:
        error = data.get("error", "Unknown error")
        raise RuntimeError(f"{context} failed: {error}")
