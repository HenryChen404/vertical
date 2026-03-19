"""CRM workflow service — extraction, review chat, push to Salesforce."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

from google import genai
from google.genai import types as genai_types

from services.extraction import (
    extract_account,
    extract_contacts,
    extract_event_summary,
    extract_opportunity,
)
from services.messages import MessageRole, add_message
from services.supabase import get_supabase
from services.workflow import WorkflowState, update_workflow_extractions, update_workflow_state

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3-flash-preview"


# --- Extract ---


async def run_extraction(workflow_id: str) -> dict:
    """Run all extraction skills in parallel. Called when all transcriptions complete."""
    db = get_supabase()

    # Collect transcripts
    tasks_resp = db.table("workflow_tasks").select("recording_id, transcript").eq(
        "workflow_id", workflow_id
    ).eq("state", 2).execute()  # 2 = COMPLETED
    transcripts = {t["recording_id"]: t["transcript"] for t in tasks_resp.data}

    combined_text = "\n\n---\n\n".join(transcripts.values())

    # TODO: enable all dimensions for production
    results = await asyncio.gather(
        # extract_opportunity(combined_text),
        # extract_contacts(combined_text),
        # extract_account(combined_text),
        extract_event_summary(combined_text),
        return_exceptions=True,
    )

    dimensions = ["event_summary"]
    extractions: dict[str, dict] = {}
    for dim, result in zip(dimensions, results):
        if isinstance(result, Exception):
            logger.error("Extraction failed for %s: %s", dim, result)
            extractions[dim] = {"status": "failed", "error": str(result)}
        else:
            extractions[dim] = {"status": "completed", "data": result}

    # Persist to DB
    update_workflow_extractions(workflow_id, extractions)
    update_workflow_state(workflow_id, WorkflowState.REVIEW)

    # Fetch and store original Salesforce values for diff
    _store_original_values(workflow_id)

    # Get recording names for the message header
    recording_ids = list(transcripts.keys())
    rec_resp = db.table("recordings").select("id, title").in_("id", recording_ids).execute()
    recording_names = [r["title"] for r in rec_resp.data] if rec_resp.data else []

    # Create extraction result message (JSON content for frontend to render)
    add_message(workflow_id, MessageRole.ASSISTANT, {
        "text": "Analysis complete. Here are the extracted CRM updates:",
        "extractions": extractions,
        "recordings": recording_names,
    })

    return extractions


# --- Review chat ---


async def chat_review(workflow_id: str, user_message: str) -> dict:
    """Process a user chat message during review, using Gemini with tools."""
    db = get_supabase()
    wf_resp = db.table("workflows").select("extractions, messages, event_id").eq("id", workflow_id).execute()
    workflow = wf_resp.data[0]

    extractions = workflow.get("extractions") or {}
    llm_messages = workflow.get("messages") or []
    llm_messages.append({"role": "user", "content": user_message})

    # Persist user message
    add_message(workflow_id, MessageRole.USER, {"text": user_message})

    # Get transcripts for potential re-extraction
    tasks_resp = db.table("workflow_tasks").select("recording_id, transcript").eq(
        "workflow_id", workflow_id
    ).eq("state", 2).execute()
    transcripts = {t["recording_id"]: t["transcript"] for t in tasks_resp.data}

    response = await _call_gemini_with_tools(llm_messages, extractions, transcripts)

    # Persist LLM context to workflow
    update_data = {
        "extractions": response["extractions"],
        "messages": response["messages"],
    }
    db.table("workflows").update(update_data).eq("id", workflow_id).execute()

    # Persist assistant response
    assistant_text = response["messages"][-1]["content"] if response["messages"] else "Done."
    msg_content: dict[str, Any] = {"text": assistant_text}
    if response.get("should_push"):
        msg_content["text"] = "Confirmed. Pushing changes to CRM..."
    if response["extractions"] != extractions:
        # Extractions were modified — include updated snapshot
        msg_content["extractions"] = response["extractions"]
    add_message(workflow_id, MessageRole.ASSISTANT, msg_content)

    return response


# --- Push to CRM ---


async def push_to_crm(workflow_id: str) -> None:
    """Push confirmed extractions to Salesforce via Composio."""
    from adapters.salesforce import SalesforceAdapter

    update_workflow_state(workflow_id, WorkflowState.PUSHING)

    adapter = SalesforceAdapter()
    client, account = adapter._get_client_and_account()

    if not client or not account:
        logger.error("No Salesforce connection for push")
        update_workflow_state(workflow_id, WorkflowState.FAILED)
        add_message(workflow_id, MessageRole.ASSISTANT, {
            "text": "Failed to connect to Salesforce.",
        })
        return

    db = get_supabase()
    wf_resp = db.table("workflows").select("extractions, event_id").eq("id", workflow_id).execute()
    workflow = wf_resp.data[0]
    extractions = workflow.get("extractions") or {}

    # Get Salesforce IDs from event
    sales_details = {}
    event_id = workflow.get("event_id")
    if event_id:
        event_resp = db.table("events").select("sales_details").eq("id", event_id).execute()
        if event_resp.data:
            sales_details = (event_resp.data[0] or {}).get("sales_details") or {}

    try:
        # Update Opportunity
        opp_data = extractions.get("opportunity", {})
        opp_id = (sales_details.get("opportunity") or {}).get("id")
        if opp_data.get("status") == "completed" and opp_id:
            fields = _map_opportunity_fields(opp_data["data"])
            if fields:
                client.tools.execute(
                    slug="SALESFORCE_UPDATE_RECORD",
                    arguments={
                        "object_type": "Opportunity",
                        "record_id": opp_id,
                        "fields": fields,
                    },
                    connected_account_id=account.id,
                )
                logger.info("Updated Opportunity %s", opp_id)

        # Update Account
        acct_data = extractions.get("account", {})
        acct_id = (sales_details.get("account") or {}).get("id")
        if acct_data.get("status") == "completed" and acct_id:
            fields = _map_account_fields(acct_data["data"])
            if fields:
                client.tools.execute(
                    slug="SALESFORCE_UPDATE_RECORD",
                    arguments={
                        "object_type": "Account",
                        "record_id": acct_id,
                        "fields": fields,
                    },
                    connected_account_id=account.id,
                )
                logger.info("Updated Account %s", acct_id)

        update_workflow_state(workflow_id, WorkflowState.DONE)
        add_message(workflow_id, MessageRole.ASSISTANT, {
            "text": "CRM update complete! Changes have been pushed to Salesforce.",
        })
        logger.info("CRM push completed for workflow %s", workflow_id)
    except Exception as e:
        logger.error("CRM push failed: %s", e)
        update_workflow_state(workflow_id, WorkflowState.FAILED)
        add_message(workflow_id, MessageRole.ASSISTANT, {
            "text": f"CRM push failed: {e}",
        })


# --- Helpers ---


def _store_original_values(workflow_id: str) -> None:
    """Fetch current Salesforce values and store on workflow for diff."""
    db = get_supabase()
    wf_resp = db.table("workflows").select("event_id").eq("id", workflow_id).execute()
    if not wf_resp.data:
        return

    event_id = wf_resp.data[0].get("event_id")
    if not event_id:
        return

    event_resp = db.table("events").select("sales_details").eq("id", event_id).execute()
    if not event_resp.data:
        return

    sales_details = (event_resp.data[0] or {}).get("sales_details") or {}
    original = {}
    if "opportunity" in sales_details:
        original["opportunity"] = sales_details["opportunity"]
    if "account" in sales_details:
        original["account"] = sales_details["account"]

    db.table("workflows").update({"original_values": original}).eq("id", workflow_id).execute()


# --- Gemini review chat ---


REVIEW_TOOLS = [
    {
        "name": "update_field",
        "description": "Update a specific field in the extracted CRM data",
        "parameters": {
            "type": "object",
            "properties": {
                "dimension": {
                    "type": "string",
                    "enum": ["opportunity", "contact", "account", "event_summary"],
                },
                "field": {"type": "string"},
                "new_value": {},
            },
            "required": ["dimension", "field", "new_value"],
        },
    },
    {
        "name": "re_extract",
        "description": "Re-run AI extraction for a specific dimension with optional extra instructions",
        "parameters": {
            "type": "object",
            "properties": {
                "dimension": {"type": "string"},
                "extra_instructions": {"type": "string"},
            },
            "required": ["dimension"],
        },
    },
    {
        "name": "confirm_and_push",
        "description": "Confirm the extracted data and push to CRM",
        "parameters": {"type": "object", "properties": {}},
    },
]


async def _call_gemini_with_tools(
    messages: list[dict],
    extractions: dict,
    transcripts: dict,
) -> dict[str, Any]:
    """Call Gemini with review tools, process tool calls, return updated state."""
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    extractions = dict(extractions)
    should_push = False

    system_instruction = (
        "You are a sales AI assistant helping review CRM data extracted from meeting transcripts. "
        "The user can ask you to update fields, re-extract dimensions, or confirm and push to CRM. "
        "Use the provided tools to make changes. Be concise and helpful.\n\n"
        "IMPORTANT formatting rules:\n"
        "- Always use standard Markdown syntax.\n"
        "- Use **bold** for emphasis.\n"
        "- For lists, always use numbered (`1.` `2.` `3.`) or bullet (`-`) syntax, "
        "with each item on its own line and a blank line before and after the list.\n"
        "- Separate paragraphs with a blank line.\n"
        "- Never concatenate list items into a single line.\n\n"
        f"Current extractions:\n{json.dumps(extractions, indent=2, default=str)}"
    )

    tool_declarations = []
    for tool in REVIEW_TOOLS:
        tool_declarations.append(genai_types.FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters=tool["parameters"],
        ))

    gemini_contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        gemini_contents.append(genai_types.Content(
            role=role,
            parts=[genai_types.Part(text=msg["content"])],
        ))

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=GEMINI_MODEL,
        contents=gemini_contents,
        config=genai_types.GenerateContentConfig(
            system_instruction=system_instruction,
            tools=[genai_types.Tool(function_declarations=tool_declarations)],
            temperature=0.3,
        ),
    )

    assistant_text_parts = []
    for part in response.candidates[0].content.parts:
        if part.text:
            assistant_text_parts.append(part.text)
        elif part.function_call:
            fc = part.function_call
            tool_result = await _execute_review_tool(fc.name, dict(fc.args), extractions, transcripts)
            if fc.name == "confirm_and_push":
                should_push = True
            elif fc.name in ("update_field", "re_extract"):
                extractions = tool_result.get("extractions", extractions)

    assistant_text = " ".join(assistant_text_parts) if assistant_text_parts else "Done."
    messages.append({"role": "assistant", "content": assistant_text})

    return {
        "extractions": extractions,
        "messages": messages,
        "should_push": should_push,
    }


async def _execute_review_tool(
    name: str, args: dict, extractions: dict, transcripts: dict
) -> dict:
    """Execute a review tool and return updated extractions."""
    if name == "update_field":
        dim = args["dimension"]
        field = args["field"]
        value = args["new_value"]
        if dim in extractions and extractions[dim].get("data"):
            extractions[dim]["data"][field] = value
        return {"extractions": extractions}

    elif name == "re_extract":
        dim = args["dimension"]
        combined_text = "\n\n---\n\n".join(transcripts.values())
        extract_fn = {
            "opportunity": extract_opportunity,
            "contact": extract_contacts,
            "account": extract_account,
            "event_summary": extract_event_summary,
        }.get(dim)
        if extract_fn:
            try:
                result = await extract_fn(combined_text)
                extractions[dim] = {"status": "completed", "data": result}
            except Exception as e:
                extractions[dim] = {"status": "failed", "error": str(e)}
        return {"extractions": extractions}

    elif name == "confirm_and_push":
        return {}

    return {}


# --- Field mapping ---


def _map_opportunity_fields(data: dict) -> dict:
    """Map extracted opportunity data to Salesforce field names."""
    fields = {}
    if data.get("stage"):
        fields["StageName"] = data["stage"]
    if data.get("amount") is not None:
        fields["Amount"] = data["amount"]
    if data.get("close_date"):
        fields["CloseDate"] = data["close_date"]
    if data.get("next_steps"):
        fields["NextStep"] = data["next_steps"]
    if data.get("probability") is not None:
        fields["Probability"] = data["probability"]
    return fields


def _map_account_fields(data: dict) -> dict:
    """Map extracted account data to Salesforce field names."""
    fields = {}
    if data.get("industry"):
        fields["Industry"] = data["industry"]
    if data.get("annual_revenue") is not None:
        fields["AnnualRevenue"] = data["annual_revenue"]
    return fields
