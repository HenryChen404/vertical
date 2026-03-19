"""LangGraph CRM workflow — Phase B: extraction → review → push."""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, TypedDict

from google import genai
from google.genai import types as genai_types
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from services.extraction import (
    extract_account,
    extract_contacts,
    extract_event_summary,
    extract_opportunity,
)
from services.supabase import get_supabase
from services.workflow import WorkflowState, update_workflow_extractions, update_workflow_state

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-3-flash-preview"


# --- State ---


class CrmWorkflowState(TypedDict):
    workflow_id: str
    transcripts: dict  # { recording_id: text }
    extractions: dict  # { dimension: { status, data/error } }
    original_values: dict  # Salesforce current values
    messages: list  # Gemini conversation history
    should_push: bool


# --- Nodes ---


async def extract(state: CrmWorkflowState) -> dict:
    """Run all extraction skills in parallel."""
    combined_text = "\n\n---\n\n".join(state["transcripts"].values())

    results = await asyncio.gather(
        extract_opportunity(combined_text),
        extract_contacts(combined_text),
        extract_account(combined_text),
        extract_event_summary(combined_text),
        return_exceptions=True,
    )

    dimensions = ["opportunity", "contact", "account", "event_summary"]
    extractions: dict[str, dict] = {}
    for dim, result in zip(dimensions, results):
        if isinstance(result, Exception):
            logger.error("Extraction failed for %s: %s", dim, result)
            extractions[dim] = {"status": "failed", "error": str(result)}
        else:
            extractions[dim] = {"status": "completed", "data": result}

    # Persist to DB
    update_workflow_extractions(state["workflow_id"], extractions)
    update_workflow_state(state["workflow_id"], WorkflowState.REVIEW)

    return {"extractions": extractions}


async def review(state: CrmWorkflowState) -> dict:
    """Human-in-the-loop review node. Interrupts for user input."""
    user_input = interrupt({
        "extractions": state["extractions"],
        "prompt": "Please review the extracted CRM data. You can ask to modify fields or confirm to push.",
    })

    # Process user input with Gemini + tools
    messages = list(state.get("messages") or [])
    messages.append({"role": "user", "content": user_input})

    response = await _call_gemini_with_tools(messages, state)

    return {
        "extractions": response["extractions"],
        "messages": response["messages"],
        "should_push": response["should_push"],
    }


async def push_to_crm(state: CrmWorkflowState) -> dict:
    """Push confirmed extractions to Salesforce via Composio."""
    from adapters.salesforce import SalesforceAdapter

    update_workflow_state(state["workflow_id"], WorkflowState.PUSHING)

    adapter = SalesforceAdapter()
    client, account = adapter._get_client_and_account()

    if not client or not account:
        logger.error("No Salesforce connection for push")
        update_workflow_state(state["workflow_id"], WorkflowState.FAILED)
        return {"should_push": False}

    extractions = state["extractions"]

    # Get the event to find related Salesforce IDs
    db = get_supabase()
    wf_resp = db.table("workflows").select("event_id").eq("id", state["workflow_id"]).execute()
    event_id = wf_resp.data[0].get("event_id")
    sales_details = {}
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

        update_workflow_state(state["workflow_id"], WorkflowState.DONE)
        logger.info("CRM push completed for workflow %s", state["workflow_id"])
    except Exception as e:
        logger.error("CRM push failed: %s", e)
        update_workflow_state(state["workflow_id"], WorkflowState.FAILED)

    return {"should_push": False}


# --- Routing ---


def route_after_review(state: CrmWorkflowState) -> str:
    return "push_to_crm" if state.get("should_push") else "review"


# --- Graph ---

builder = StateGraph(CrmWorkflowState)
builder.add_node("extract", extract)
builder.add_node("review", review)
builder.add_node("push_to_crm", push_to_crm)
builder.add_edge(START, "extract")
builder.add_edge("extract", "review")
builder.add_conditional_edges("review", route_after_review)
builder.add_edge("push_to_crm", END)


_pool = None
_checkpointer_ready = False


async def get_graph():
    """Compile the graph with a shared Postgres connection pool (singleton)."""
    global _pool, _checkpointer_ready

    if _pool is None:
        db_uri = os.getenv("SUPABASE_DB_URI")
        if not db_uri:
            raise RuntimeError("SUPABASE_DB_URI not set")

        from psycopg_pool import AsyncConnectionPool

        _pool = AsyncConnectionPool(conninfo=db_uri, open=False)
        await _pool.open()

    if not _checkpointer_ready:
        checkpointer = AsyncPostgresSaver(_pool)
        await checkpointer.setup()
        _checkpointer_ready = True

    return builder.compile(checkpointer=AsyncPostgresSaver(_pool))


# --- Phase A → Phase B bridge ---


async def start_langgraph(workflow_id: str) -> None:
    """Called when all transcription tasks complete. Starts the LangGraph workflow."""
    db = get_supabase()

    # Collect all transcripts
    tasks_resp = db.table("workflow_tasks").select("recording_id, transcript").eq(
        "workflow_id", workflow_id
    ).eq("state", 2).execute()  # 2 = COMPLETED
    transcripts = {t["recording_id"]: t["transcript"] for t in tasks_resp.data}

    # Fetch Salesforce current values (original_values for diff)
    original_values = await _fetch_original_values(workflow_id)

    # Start LangGraph
    graph = await get_graph()
    await graph.ainvoke(
        {
            "workflow_id": workflow_id,
            "transcripts": transcripts,
            "extractions": {},
            "original_values": original_values,
            "messages": [],
            "should_push": False,
        },
        config={"configurable": {"thread_id": workflow_id}},
    )


async def _fetch_original_values(workflow_id: str) -> dict:
    """Fetch current Salesforce values for comparison."""
    db = get_supabase()
    wf_resp = db.table("workflows").select("event_id").eq("id", workflow_id).execute()
    if not wf_resp.data:
        return {}

    event_id = wf_resp.data[0].get("event_id")
    if not event_id:
        return {}

    event_resp = db.table("events").select("sales_details").eq("id", event_id).execute()
    if not event_resp.data:
        return {}

    sales_details = (event_resp.data[0] or {}).get("sales_details") or {}

    # Store original values from sales_details
    original = {}
    if "opportunity" in sales_details:
        original["opportunity"] = sales_details["opportunity"]
    if "account" in sales_details:
        original["account"] = sales_details["account"]

    # Persist to workflow
    db.table("workflows").update({"original_values": original}).eq("id", workflow_id).execute()

    return original


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
    state: CrmWorkflowState,
) -> dict[str, Any]:
    """Call Gemini with review tools, process tool calls, return updated state."""
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

    extractions = dict(state["extractions"])
    should_push = False

    system_instruction = (
        "You are a sales AI assistant helping review CRM data extracted from meeting transcripts. "
        "The user can ask you to update fields, re-extract dimensions, or confirm and push to CRM. "
        "Use the provided tools to make changes. Be concise and helpful.\n\n"
        f"Current extractions:\n{json.dumps(extractions, indent=2, default=str)}"
    )

    # Convert tools to Gemini function declarations
    tool_declarations = []
    for tool in REVIEW_TOOLS:
        tool_declarations.append(genai_types.FunctionDeclaration(
            name=tool["name"],
            description=tool["description"],
            parameters=tool["parameters"],
        ))

    # Build Gemini messages
    gemini_contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        gemini_contents.append(genai_types.Content(
            role=role,
            parts=[genai_types.Part(text=msg["content"])],
        ))

    # Run sync Gemini call in a thread to avoid blocking the event loop
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

    # Process response
    assistant_text_parts = []
    for part in response.candidates[0].content.parts:
        if part.text:
            assistant_text_parts.append(part.text)
        elif part.function_call:
            fc = part.function_call
            tool_result = await _execute_review_tool(fc.name, dict(fc.args), extractions, state)
            if fc.name == "confirm_and_push":
                should_push = True
            elif fc.name == "update_field":
                extractions = tool_result.get("extractions", extractions)
            elif fc.name == "re_extract":
                extractions = tool_result.get("extractions", extractions)

    assistant_text = " ".join(assistant_text_parts) if assistant_text_parts else "Done."
    messages.append({"role": "assistant", "content": assistant_text})

    # Persist updated extractions
    update_workflow_extractions(state["workflow_id"], extractions)

    return {
        "extractions": extractions,
        "messages": messages,
        "should_push": should_push,
    }


async def _execute_review_tool(
    name: str, args: dict, extractions: dict, state: CrmWorkflowState
) -> dict:
    """Execute a review tool and return updated state."""
    if name == "update_field":
        dim = args["dimension"]
        field = args["field"]
        value = args["new_value"]
        if dim in extractions and extractions[dim].get("data"):
            extractions[dim]["data"][field] = value
        return {"extractions": extractions}

    elif name == "re_extract":
        dim = args["dimension"]
        combined_text = "\n\n---\n\n".join(state["transcripts"].values())
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
