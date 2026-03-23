"""CRM workflow service — analysis, review chat, push to Salesforce."""

from __future__ import annotations

import asyncio
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


async def _analyze_single_recording(
    recording_id: str,
    recording_name: str,
    transcript: str,
    crm_context: dict[str, Any],
    index: int,
    total_recordings: int,
    workflow_id: str,
) -> dict:
    """Analyze a single recording's transcript and return per-recording result.

    Returns:
        {"recording_id": str, "name": str, "proposed_changes": [...], "summary": str}
        or {"recording_id": str, "name": str, "proposed_changes": [], "summary": str, "error": str}
        on failure.
    """
    db = get_supabase()

    from skills.sales_analyst.prompts import get_analysis_categories
    total_steps = len(get_analysis_categories())

    async def _on_progress(completed: int, total: int, cat_name: str):
        phase = "summarizing" if cat_name == "_summary" else "analyzing"
        # Write per-recording progress
        db.table("workflows").update({
            "extractions": {"_analysis_progress": {
                "recording_index": index,
                "recording_total": total_recordings,
                "recording_name": recording_name,
                "completed": min(completed, total_steps),
                "total": total_steps,
                "phase": phase,
            }},
        }).eq("id", workflow_id).execute()

    try:
        t0 = time.time()
        result = await _skill_run_analysis(transcript, crm_context, on_progress=_on_progress)
        elapsed = _ms(t0)
        logger.info(
            "Workflow %s: recording %s (%s) analysis complete — %d changes in %dms",
            workflow_id, recording_id, recording_name,
            len(result.proposed_changes), elapsed,
        )
        return {
            "recording_id": recording_id,
            "name": recording_name,
            "proposed_changes": [c.model_dump() for c in result.proposed_changes],
            "summary": result.summary,
        }
    except Exception as e:
        logger.error(
            "Workflow %s: recording %s (%s) analysis failed: %s",
            workflow_id, recording_id, recording_name, e, exc_info=True,
        )
        return {
            "recording_id": recording_id,
            "name": recording_name,
            "proposed_changes": [],
            "summary": f"Analysis failed: {e}",
            "error": str(e),
        }


async def run_analysis(workflow_id: str) -> dict:
    """Analyze transcripts per-recording in parallel and generate proposed CRM changes.

    Called when all transcriptions complete. Each recording is extracted
    independently and results are stored per-recording.
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
    total_chars = sum(len(t) for t in transcripts.values())
    logger.info("Workflow %s: collected %d transcripts (%d chars total)",
                workflow_id, len(transcripts), total_chars)

    # Build CRM context ONCE (shared across all recordings)
    crm_context = _get_crm_context(workflow_id)
    logger.info("Workflow %s: CRM context — event=%s, opportunity=%s, account=%s, feedback=%s",
                workflow_id,
                bool(crm_context.get("event")),
                bool(crm_context.get("opportunity")),
                bool(crm_context.get("account")),
                bool(crm_context.get("user_feedback")))

    # Get recording names
    recording_ids = list(transcripts.keys())
    rec_resp = db.table("recordings").select("id, title").in_("id", recording_ids).execute()
    rec_names = {r["id"]: r["title"] for r in rec_resp.data} if rec_resp.data else {}

    total_recordings = len(transcripts)
    logger.info("Workflow %s: launching parallel analysis for %d recordings...",
                workflow_id, total_recordings)

    # Write initial progress
    from skills.sales_analyst.prompts import get_analysis_categories
    total_steps = len(get_analysis_categories())
    db.table("workflows").update({
        "extractions": {"_analysis_progress": {
            "recording_index": 0,
            "recording_total": total_recordings,
            "completed": 0,
            "total": total_steps,
            "phase": "analyzing",
        }},
    }).eq("id", workflow_id).execute()

    # Run analysis for each recording in PARALLEL
    t_llm = time.time()
    coros = [
        _analyze_single_recording(
            recording_id=rec_id,
            recording_name=rec_names.get(rec_id, f"Recording {i+1}"),
            transcript=rec_transcript,
            crm_context=crm_context,
            index=i,
            total_recordings=total_recordings,
            workflow_id=workflow_id,
        )
        for i, (rec_id, rec_transcript) in enumerate(transcripts.items())
    ]
    recording_results = await asyncio.gather(*coros)
    llm_ms = _ms(t_llm)

    # Build per-recording extractions structure
    recordings_data = list(recording_results)

    # Re-number change IDs to be globally unique across recordings
    global_idx = 1
    for rec_data in recordings_data:
        for change in rec_data["proposed_changes"]:
            change["id"] = f"chg_{global_idx}"
            global_idx += 1

    total_changes = sum(len(r["proposed_changes"]) for r in recordings_data)
    failed_count = sum(1 for r in recordings_data if r.get("error"))
    logger.info("Workflow %s: analysis complete — %d total changes across %d recordings (%d failed)",
                workflow_id, total_changes, total_recordings, failed_count)

    # Persist to DB
    extractions_data = {
        "recordings": recordings_data,
    }
    update_workflow_extractions(workflow_id, extractions_data)
    update_workflow_state(workflow_id, WorkflowState.REVIEW)

    # Build combined summary from all recordings
    summaries = [r["summary"] for r in recordings_data if r.get("summary") and not r.get("error")]
    combined_summary = "\n\n".join(summaries) if summaries else "No significant changes identified."

    # Build flat proposed_changes list for the message (all recordings combined)
    all_proposed_changes = []
    for rec_data in recordings_data:
        all_proposed_changes.extend(rec_data["proposed_changes"])

    recording_names = [r["name"] for r in recordings_data]

    # Create assistant message with proposed changes
    add_message(workflow_id, MessageRole.ASSISTANT, {
        "text": combined_summary,
        "proposed_changes": all_proposed_changes,
        "recordings": recording_names,
    })

    # Log timing
    total_ms = _ms(t0)
    logger.info(
        "⏱ TIMING [analysis] workflow=%s total=%dms llm=%dms "
        "transcript_chars=%d transcript_count=%d proposed_changes=%d",
        workflow_id, total_ms, llm_ms, total_chars,
        len(transcripts), total_changes,
    )

    return extractions_data


# --- Review chat ---


def _get_recording_data(extractions: dict, recording_id: str | None) -> tuple[list[dict], int | None]:
    """Get proposed_changes for a specific recording (or all).

    Returns:
        (proposed_changes, recording_index) — recording_index is None if no
        recording_id filter was applied.
    """
    recordings = extractions.get("recordings", [])

    if recording_id:
        for i, rec in enumerate(recordings):
            if rec["recording_id"] == recording_id:
                return rec.get("proposed_changes", []), i
        # recording_id not found — return empty
        return [], None

    # No recording_id — return all changes combined
    all_changes = []
    for rec in recordings:
        all_changes.extend(rec.get("proposed_changes", []))
    return all_changes, None


def _update_recording_changes(extractions: dict, recording_index: int, proposed_changes: list[dict]) -> dict:
    """Update proposed_changes for a specific recording in the extractions structure."""
    recordings = extractions.get("recordings", [])
    if 0 <= recording_index < len(recordings):
        recordings[recording_index]["proposed_changes"] = proposed_changes
    return extractions


async def chat_review(workflow_id: str, user_message: str, recording_id: str | None = None) -> dict:
    """Process a user chat message during review.

    Args:
        workflow_id: The workflow to operate on.
        user_message: The user's message text.
        recording_id: If provided, scope chat to this recording's changes only.
    """
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
    proposed_changes, rec_index = _get_recording_data(extractions, recording_id)
    llm_messages = workflow.get("messages") or []
    llm_messages.append({"role": "user", "content": user_message})

    # Persist user message
    add_message(workflow_id, MessageRole.USER, {"text": user_message, "recording_id": recording_id})

    # Get transcript(s) for context
    tasks_resp = (
        db.table("workflow_tasks")
        .select("recording_id, transcript")
        .eq("workflow_id", workflow_id)
        .eq("state", 2)
        .execute()
    )
    if recording_id:
        # Only the relevant recording's transcript
        transcript_text = ""
        for t in tasks_resp.data:
            if t["recording_id"] == recording_id:
                transcript_text = t["transcript"]
                break
    else:
        transcript_text = "\n\n---\n\n".join(t["transcript"] for t in tasks_resp.data)

    # Call the review agent
    t_llm = time.time()
    response = await _skill_chat_review(llm_messages, proposed_changes, transcript_text)
    llm_ms = _ms(t_llm)

    # Persist updated state — update the specific recording or all
    if rec_index is not None:
        _update_recording_changes(extractions, rec_index, response["proposed_changes"])
    else:
        # Distribute changes back to recordings by matching IDs
        _redistribute_changes(extractions, response["proposed_changes"])

    db.table("workflows").update({
        "extractions": extractions,
        "messages": response["messages"],
    }).eq("id", workflow_id).execute()

    # Persist assistant response — include the recording's proposed_changes
    assistant_text = response["messages"][-1]["content"] if response["messages"] else "Done."
    msg_content: dict[str, Any] = {"text": assistant_text, "recording_id": recording_id}
    if response.get("should_push"):
        msg_content["text"] = "Confirmed. Pushing changes to CRM..."
    msg_content["proposed_changes"] = response["proposed_changes"]
    add_message(workflow_id, MessageRole.ASSISTANT, msg_content)

    # Log timing
    total_ms = _ms(t0)
    logger.info(
        "⏱ TIMING [chat_review] workflow=%s total=%dms llm=%dms "
        "message_count=%d should_push=%s recording_id=%s",
        workflow_id, total_ms, llm_ms,
        len(llm_messages), response.get("should_push"), recording_id,
    )

    return {
        "extractions": extractions,
        "messages": response["messages"],
        "should_push": response.get("should_push", False),
    }


def _redistribute_changes(extractions: dict, updated_changes: list[dict]) -> None:
    """Distribute a flat list of updated changes back to their source recordings.

    Changes are matched by ID. New changes (IDs not found in any recording)
    are appended to the first recording.
    """
    recordings = extractions.get("recordings", [])
    if not recordings:
        return

    # Build a map of change_id -> recording_index
    change_to_rec: dict[str, int] = {}
    for i, rec in enumerate(recordings):
        for change in rec.get("proposed_changes", []):
            change_to_rec[change["id"]] = i

    # Clear all recordings' changes, then redistribute
    new_changes_per_rec: dict[int, list[dict]] = {i: [] for i in range(len(recordings))}
    for change in updated_changes:
        rec_idx = change_to_rec.get(change["id"], 0)  # default to first recording
        new_changes_per_rec[rec_idx].append(change)

    for i, rec in enumerate(recordings):
        rec["proposed_changes"] = new_changes_per_rec.get(i, [])


# --- Push to CRM ---


def _collect_proposed_changes(extractions: dict, recording_id: str | None = None) -> list[dict]:
    """Collect proposed_changes from the per-recording structure.

    Args:
        extractions: The workflow extractions dict.
        recording_id: If provided, only return changes for this recording.

    Returns:
        Flat list of proposed_change dicts.
    """
    recordings = extractions.get("recordings", [])
    all_changes = []
    for rec in recordings:
        if recording_id and rec["recording_id"] != recording_id:
            continue
        all_changes.extend(rec.get("proposed_changes", []))
    return all_changes


async def push_to_crm(workflow_id: str, recording_id: str | None = None) -> None:
    """Push approved proposed changes to Salesforce.

    Args:
        workflow_id: The workflow to push.
        recording_id: If provided, only push changes for this recording (partial push).
    """
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
    proposed_changes = _collect_proposed_changes(extractions, recording_id)
    user_id = workflow.get("user_id")

    if not proposed_changes:
        logger.warning("Workflow %s: no proposed changes to push (recording_id=%s)",
                        workflow_id, recording_id)
        update_workflow_state(workflow_id, WorkflowState.FAILED)
        return

    try:
        t_push = time.time()
        approved = [c for c in proposed_changes if c.get("approved")]
        total_to_push = len(approved)

        # Update push progress so SSE can report it
        def _update_push_progress(completed: int):
            db.table("workflows").update({
                "extractions": db.table("workflows")
                    .select("extractions")
                    .eq("id", workflow_id)
                    .execute()
                    .data[0].get("extractions", {})
                    | {"_push_progress": {"completed": completed, "total": total_to_push}}
            }).eq("id", workflow_id).execute()

        # Push changes one by one with progress tracking
        from skills.connectors.salesforce import push_one_change
        results = []
        for i, change in enumerate(approved):
            result = await push_one_change(change, user_id)
            results.append(result)
            _update_push_progress(i + 1)

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

            if recording_id:
                # Partial push — go back to review (not done)
                update_workflow_state(workflow_id, WorkflowState.REVIEW)
            else:
                update_workflow_state(workflow_id, WorkflowState.DONE)

            logger.info("CRM push completed for workflow %s: %d ok, %d failed (recording_id=%s)",
                        workflow_id, len(successes), len(failures), recording_id)

            # Mark related recordings as synced (crm_sync_status=2)
            if recording_id:
                # Partial push — only mark this recording
                rec_ids = [recording_id]
            else:
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
            "approved=%d ok=%d fail=%d recording_id=%s",
            workflow_id, total_ms, push_api_ms,
            approved_count, len(successes), len(failures), recording_id,
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
