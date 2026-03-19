"""Tool definitions and execution for the review chat phase."""

from __future__ import annotations

import uuid
from typing import Any

from google.genai import types as genai_types


# --- Tool declarations for Gemini function calling ---

REVIEW_TOOL_DECLARATIONS = [
    genai_types.FunctionDeclaration(
        name="modify_change",
        description="Modify or add a field in an existing proposed CRM change. "
        "Use this to update a field value OR to add a new field to an existing change record.",
        parameters={
            "type": "object",
            "properties": {
                "change_id": {
                    "type": "string",
                    "description": "ID of the proposed change to modify (e.g. 'chg_1')",
                },
                "field": {
                    "type": "string",
                    "description": "Salesforce API field name to modify or add (e.g. 'StageName', 'CloseDate')",
                },
                "label": {
                    "type": "string",
                    "description": "Human-readable label for the field (e.g. 'Close Date'). Required when adding a new field.",
                },
                "new_value": {
                    "type": "string",
                    "description": "New value for the field",
                },
            },
            "required": ["change_id", "field", "new_value"],
        },
    ),
    genai_types.FunctionDeclaration(
        name="remove_change",
        description="Remove a proposed change or a specific field from a change. "
        "If only change_id is provided, the entire change is removed. "
        "If field is also provided, only that field is removed from the change.",
        parameters={
            "type": "object",
            "properties": {
                "change_id": {
                    "type": "string",
                    "description": "ID of the proposed change",
                },
                "fields": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional: Salesforce API field names to remove. If omitted, the entire change is removed.",
                },
            },
            "required": ["change_id"],
        },
    ),
    genai_types.FunctionDeclaration(
        name="add_change",
        description="Add a new proposed CRM change with one or more fields. "
        "All fields are added to a SINGLE change record — do NOT call this multiple times for the same record.",
        parameters={
            "type": "object",
            "properties": {
                "object_type": {
                    "type": "string",
                    "description": "Salesforce object type (e.g. 'Opportunity', 'Task')",
                },
                "object_name": {
                    "type": "string",
                    "description": "Display name for the record",
                },
                "record_id": {
                    "type": "string",
                    "description": "Salesforce record ID (null for create actions)",
                },
                "action": {
                    "type": "string",
                    "enum": ["update", "create"],
                },
                "fields": {
                    "type": "array",
                    "description": "List of field changes to include in this record",
                    "items": {
                        "type": "object",
                        "properties": {
                            "field": {
                                "type": "string",
                                "description": "Salesforce API field name",
                            },
                            "label": {
                                "type": "string",
                                "description": "Human-readable field label",
                            },
                            "old_value": {
                                "type": "string",
                                "description": "Current value (for update actions)",
                            },
                            "new_value": {
                                "type": "string",
                                "description": "Proposed new value",
                            },
                        },
                        "required": ["field", "label", "new_value"],
                    },
                },
            },
            "required": ["object_type", "action", "fields"],
        },
    ),
    genai_types.FunctionDeclaration(
        name="confirm_and_push",
        description="Confirm all approved changes and push them to Salesforce CRM",
        parameters={"type": "object", "properties": {}},
    ),
]


# --- Tool execution ---


def execute_tool(
    name: str,
    args: dict[str, Any],
    proposed_changes: list[dict],
) -> dict[str, Any]:
    """Execute a review tool and return updated state.

    Args:
        name: Tool name.
        args: Tool arguments from Gemini function call.
        proposed_changes: Current proposed changes list (mutated in place).

    Returns:
        {"proposed_changes": [...], "should_push": bool}
    """
    if name == "modify_change":
        return _modify_change(args, proposed_changes)
    elif name == "remove_change":
        return _remove_change(args, proposed_changes)
    elif name == "add_change":
        return _add_change(args, proposed_changes)
    elif name == "confirm_and_push":
        return {"proposed_changes": proposed_changes, "should_push": True}
    return {"proposed_changes": proposed_changes, "should_push": False}


def _modify_change(args: dict, proposed_changes: list[dict]) -> dict:
    change_id = args["change_id"]
    field = args["field"]
    label = args.get("label", field)
    new_value = args["new_value"]

    for change in proposed_changes:
        if change["id"] == change_id:
            for diff in change["changes"]:
                if diff["field"] == field:
                    diff["new"] = new_value
                    break
            else:
                # Field not found — add it to the existing change
                change["changes"].append({
                    "field": field,
                    "label": label,
                    "new": new_value,
                })
            break

    return {"proposed_changes": proposed_changes, "should_push": False}


def _remove_change(args: dict, proposed_changes: list[dict]) -> dict:
    change_id = args["change_id"]
    fields = args.get("fields") or []
    # Legacy single-field fallback
    if not fields and args.get("field"):
        fields = [args["field"]]

    for change in proposed_changes:
        if change["id"] == change_id:
            if fields:
                remove_set = set(fields)
                change["changes"] = [d for d in change["changes"] if d["field"] not in remove_set]
                if not change["changes"]:
                    change["approved"] = False
            else:
                change["approved"] = False
            break
    return {"proposed_changes": proposed_changes, "should_push": False}


def _add_change(args: dict, proposed_changes: list[dict]) -> dict:
    new_id = f"chg_{len(proposed_changes) + 1}_{uuid.uuid4().hex[:4]}"

    # Support both new array format and legacy single-field format
    fields_arg = args.get("fields", [])
    if not fields_arg and args.get("field"):
        # Legacy single-field fallback
        fields_arg = [{
            "field": args["field"],
            "label": args.get("label", args["field"]),
            "old_value": args.get("old_value"),
            "new_value": args["new_value"],
        }]

    changes = []
    for f in fields_arg:
        changes.append({
            "field": f["field"],
            "label": f.get("label", f["field"]),
            "old": f.get("old_value"),
            "new": f["new_value"],
        })

    new_change = {
        "id": new_id,
        "object_type": args["object_type"],
        "object_name": args.get("object_name"),
        "record_id": args.get("record_id"),
        "action": args["action"],
        "changes": changes,
        "approved": True,
    }
    proposed_changes.append(new_change)
    return {"proposed_changes": proposed_changes, "should_push": False}
