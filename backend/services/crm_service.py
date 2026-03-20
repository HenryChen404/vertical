"""CRM workflow service — analysis, review chat, push to Salesforce."""

from __future__ import annotations

import logging
import time
from typing import Any

from skills.sales_analyst import chat_review as _skill_chat_review
from skills.sales_analyst import run_analysis as _skill_run_analysis
from skills.connectors.salesforce import push_changes as _push_changes

from services.messages import MessageRole, add_message
from services.supabase import get_supabase
from services.workflow import WorkflowState, update_workflow_extractions, update_workflow_state

logger = logging.getLogger(__name__)


def _ms(t0: float) -> int:
    """Elapsed milliseconds since t0."""
    return int((time.time() - t0) * 1000)


# --- Analyze ---


async def run_analysis(workflow_id: str) -> dict:
    """Analyze transcripts and generate proposed CRM changes.

    Called when all transcriptions complete. Replaces the old run_extraction().
    """
    t0 = time.time()
    db = get_supabase()

    # Collect transcripts
    tasks_resp = (
        db.table("workflow_tasks")
        .select("recording_id, transcript")
        .eq("workflow_id", workflow_id)
        .eq("state", 2)  # COMPLETED
        .execute()
    )
    transcripts = {t["recording_id"]: t["transcript"] for t in tasks_resp.data}
    combined_text = "\n\n---\n\n".join(transcripts.values())
    logger.info("Workflow %s: collected %d transcripts (%d chars total)",
                workflow_id, len(transcripts), len(combined_text))

    # Build CRM context from event's sales_details
    crm_context = _get_crm_context(workflow_id)
    logger.info("Workflow %s: CRM context — event=%s, opportunity=%s, account=%s, feedback=%s",
                workflow_id,
                bool(crm_context.get("event")),
                bool(crm_context.get("opportunity")),
                bool(crm_context.get("account")),
                bool(crm_context.get("user_feedback")))

    # Run the sales analyst agent
    logger.info("Workflow %s: calling sales analyst agent...", workflow_id)
    t_llm = time.time()
    result = await _skill_run_analysis(combined_text, crm_context)
    llm_ms = _ms(t_llm)
    logger.info("Workflow %s: analysis complete — %d proposed changes",
                workflow_id, len(result.proposed_changes))

    # Persist to DB
    extractions_data = {
        "proposed_changes": [c.model_dump() for c in result.proposed_changes],
        "summary": result.summary,
    }
    update_workflow_extractions(workflow_id, extractions_data)
    update_workflow_state(workflow_id, WorkflowState.REVIEW)

    # Get recording names for the message header
    recording_ids = list(transcripts.keys())
    rec_resp = db.table("recordings").select("id, title").in_("id", recording_ids).execute()
    recording_names = [r["title"] for r in rec_resp.data] if rec_resp.data else []

    # Create assistant message with proposed changes
    add_message(workflow_id, MessageRole.ASSISTANT, {
        "text": result.summary,
        "proposed_changes": [c.model_dump() for c in result.proposed_changes],
        "recordings": recording_names,
    })

    # Log timing
    total_ms = _ms(t0)
    logger.info(
        "⏱ TIMING [analysis] workflow=%s total=%dms llm=%dms "
        "transcript_chars=%d transcript_count=%d proposed_changes=%d",
        workflow_id, total_ms, llm_ms, len(combined_text),
        len(transcripts), len(result.proposed_changes),
    )

    return extractions_data


# --- Review chat ---


async def chat_review(workflow_id: str, user_message: str) -> dict:
    """Process a user chat message during review."""
    t0 = time.time()
    db = get_supabase()
    wf_resp = (
        db.table("workflows")
        .select("extractions, messages, event_id")
        .eq("id", workflow_id)
        .execute()
    )
    workflow = wf_resp.data[0]

    extractions = workflow.get("extractions") or {}
    proposed_changes = extractions.get("proposed_changes", [])
    llm_messages = workflow.get("messages") or []
    llm_messages.append({"role": "user", "content": user_message})

    # Persist user message
    add_message(workflow_id, MessageRole.USER, {"text": user_message})

    # Get transcripts for context
    tasks_resp = (
        db.table("workflow_tasks")
        .select("recording_id, transcript")
        .eq("workflow_id", workflow_id)
        .eq("state", 2)
        .execute()
    )
    combined_text = "\n\n---\n\n".join(t["transcript"] for t in tasks_resp.data)

    # Call the review agent
    t_llm = time.time()
    response = await _skill_chat_review(llm_messages, proposed_changes, combined_text)
    llm_ms = _ms(t_llm)

    # Persist updated state
    updated_extractions = {
        **extractions,
        "proposed_changes": response["proposed_changes"],
    }
    db.table("workflows").update({
        "extractions": updated_extractions,
        "messages": response["messages"],
    }).eq("id", workflow_id).execute()

    # Persist assistant response — always include latest proposed_changes
    assistant_text = response["messages"][-1]["content"] if response["messages"] else "Done."
    msg_content: dict[str, Any] = {"text": assistant_text}
    if response.get("should_push"):
        msg_content["text"] = "Confirmed. Pushing changes to CRM..."
    msg_content["proposed_changes"] = response["proposed_changes"]
    add_message(workflow_id, MessageRole.ASSISTANT, msg_content)

    # Log timing
    total_ms = _ms(t0)
    logger.info(
        "⏱ TIMING [chat_review] workflow=%s total=%dms llm=%dms "
        "message_count=%d should_push=%s",
        workflow_id, total_ms, llm_ms,
        len(llm_messages), response.get("should_push"),
    )

    return {
        "extractions": updated_extractions,
        "messages": response["messages"],
        "should_push": response.get("should_push", False),
    }


# --- Push to CRM ---


async def push_to_crm(workflow_id: str) -> None:
    """Push approved proposed changes to Salesforce."""
    t0 = time.time()
    update_workflow_state(workflow_id, WorkflowState.PUSHING)

    db = get_supabase()
    wf_resp = (
        db.table("workflows")
        .select("extractions, user_id")
        .eq("id", workflow_id)
        .execute()
    )
    workflow = wf_resp.data[0]
    extractions = workflow.get("extractions") or {}
    proposed_changes = extractions.get("proposed_changes", [])
    user_id = workflow.get("user_id")

    if not proposed_changes:
        logger.warning("Workflow %s: no proposed changes to push", workflow_id)
        update_workflow_state(workflow_id, WorkflowState.FAILED)
        return

    try:
        t_push = time.time()
        results = await _push_changes(proposed_changes, user_id)
        push_api_ms = _ms(t_push)

        successes = [r for r in results if r["success"]]
        failures = [r for r in results if not r["success"]]

        if failures and not successes:
            logger.error("Workflow %s: all pushes failed — %s", workflow_id,
                         "; ".join(r.get("error", "Unknown") for r in failures))
            add_message(workflow_id, MessageRole.ASSISTANT, {
                "text": "Some changes failed to push to Salesforce. You can try again.",
            })
            update_workflow_state(workflow_id, WorkflowState.FAILED)
        else:
            if failures:
                add_message(workflow_id, MessageRole.ASSISTANT, {
                    "text": f"Pushed {len(successes)} changes to Salesforce. {len(failures)} failed.",
                })
            else:
                add_message(workflow_id, MessageRole.ASSISTANT, {
                    "text": "All changes have been pushed to Salesforce successfully.",
                })
            update_workflow_state(workflow_id, WorkflowState.DONE)
            logger.info("CRM push completed for workflow %s: %d ok, %d failed",
                        workflow_id, len(successes), len(failures))

            # Mark related recordings as synced (crm_sync_status=2)
            tasks_resp = (
                db.table("workflow_tasks")
                .select("recording_id")
                .eq("workflow_id", workflow_id)
                .execute()
            )
            rec_ids = [t["recording_id"] for t in tasks_resp.data if t.get("recording_id")]
            if rec_ids:
                db.table("recordings").update({"crm_sync_status": 2}).in_("id", rec_ids).execute()
                logger.info("Marked %d recordings as synced", len(rec_ids))

        # Log timing
        total_ms = _ms(t0)
        approved_count = sum(1 for c in proposed_changes if c.get("approved"))
        logger.info(
            "⏱ TIMING [push] workflow=%s total=%dms api=%dms "
            "approved=%d ok=%d fail=%d",
            workflow_id, total_ms, push_api_ms,
            approved_count, len(successes), len(failures),
        )

    except Exception as e:
        logger.error("CRM push failed for workflow %s: %s", workflow_id, e)
        logger.info("⏱ TIMING [push] workflow=%s total=%dms error=%s",
                     workflow_id, _ms(t0), e)
        add_message(workflow_id, MessageRole.ASSISTANT, {
            "text": "Something went wrong pushing to Salesforce. You can try again.",
        })
        update_workflow_state(workflow_id, WorkflowState.FAILED)


# --- Helpers ---


def _get_crm_context(workflow_id: str) -> dict[str, Any]:
    """Build CRM context from the event's sales_details for the agent."""
    db = get_supabase()

    wf_resp = db.table("workflows").select("event_id").eq("id", workflow_id).execute()
    if not wf_resp.data:
        return {}

    event_id = wf_resp.data[0].get("event_id")
    if not event_id:
        return {}

    event_resp = (
        db.table("events")
        .select("id, title, start_time, end_time, sales_details, feedback")
        .eq("id", event_id)
        .execute()
    )
    if not event_resp.data:
        return {}

    event = event_resp.data[0]
    sales_details = event.get("sales_details") or {}

    # Look up Salesforce Event ID from event_sources
    sf_event_id = None
    es_resp = (
        db.table("event_sources")
        .select("source_id")
        .eq("event_id", event_id)
        .eq("source", "salesforce")
        .limit(1)
        .execute()
    )
    if es_resp.data:
        sf_event_id = es_resp.data[0]["source_id"]

    ctx: dict[str, Any] = {
        "event": {
            "id": sf_event_id or event["id"],  # Salesforce ID if available
            "subject": event.get("title", ""),
            "start_time": event.get("start_time", ""),
            "end_time": event.get("end_time", ""),
        },
        "opportunity": sales_details.get("opportunity"),
        "account": sales_details.get("account"),
        "participants": sales_details.get("participants"),
    }

    # Include user feedback if available (first-hand subjective impression)
    feedback = event.get("feedback")
    if feedback:
        ctx["user_feedback"] = feedback

    return ctx
