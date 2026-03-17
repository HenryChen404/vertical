"""Workflow state machine for CRM update workflow (Phase A)."""

from __future__ import annotations

import logging
from enum import IntEnum

from services.supabase import get_supabase

logger = logging.getLogger(__name__)


class WorkflowState(IntEnum):
    CREATED = 0
    TRANSCRIBING = 1
    EXTRACTING = 2
    REVIEW = 3
    PUSHING = 4
    DONE = 5
    FAILED = 6


class TaskState(IntEnum):
    PENDING = 0
    TRANSCRIBING = 1
    COMPLETED = 2
    FAILED = 3


class TaskType:
    PLAUD = "plaud"
    LOCAL = "local"


def create_workflow(
    event_id: str,
    recordings: list[dict],
) -> dict:
    """Create a workflow + tasks for the given event and recordings.

    Args:
        event_id: UUID of the event.
        recordings: list of {"type": "plaud"|"local", "id": "..."}.

    Returns:
        The created workflow row.
    """
    db = get_supabase()

    # Create workflow
    wf_resp = db.table("workflows").insert({
        "event_id": event_id,
        "state": WorkflowState.TRANSCRIBING,
    }).execute()
    workflow = wf_resp.data[0]
    workflow_id = workflow["id"]

    # Create tasks
    tasks = []
    for rec in recordings:
        task_resp = db.table("workflow_tasks").insert({
            "workflow_id": workflow_id,
            "type": rec["type"],
            "recording_id": rec["id"],
            "state": TaskState.PENDING,
        }).execute()
        tasks.append(task_resp.data[0])

    logger.info("Created workflow %s with %d tasks", workflow_id, len(tasks))
    workflow["tasks"] = tasks
    return workflow


def on_task_completed(task_id: str, transcript: str) -> dict:
    """Mark a task as completed and check if all tasks are done.

    Returns the updated workflow.
    """
    db = get_supabase()

    # Update task
    task_resp = db.table("workflow_tasks").update({
        "state": TaskState.COMPLETED,
        "transcript": transcript,
    }).eq("id", task_id).execute()
    task = task_resp.data[0]
    workflow_id = task["workflow_id"]

    return _check_all_tasks_done(workflow_id)


def on_task_failed(task_id: str, error: str) -> dict:
    """Mark a task as failed and check if all tasks are in terminal state.

    Returns the updated workflow.
    """
    db = get_supabase()

    # Update task
    task_resp = db.table("workflow_tasks").update({
        "state": TaskState.FAILED,
        "error": error,
    }).eq("id", task_id).execute()
    task = task_resp.data[0]
    workflow_id = task["workflow_id"]

    return _check_all_tasks_done(workflow_id)


def _check_all_tasks_done(workflow_id: str) -> dict:
    """Check if all tasks are in terminal state. If so, advance workflow."""
    db = get_supabase()

    # Count non-terminal tasks (pending or transcribing)
    tasks_resp = db.table("workflow_tasks").select("id, state").eq(
        "workflow_id", workflow_id
    ).execute()
    tasks = tasks_resp.data

    pending = [t for t in tasks if t["state"] in (TaskState.PENDING, TaskState.TRANSCRIBING)]
    completed = [t for t in tasks if t["state"] == TaskState.COMPLETED]

    if pending:
        # Still waiting
        wf_resp = db.table("workflows").select("*").eq("id", workflow_id).execute()
        return wf_resp.data[0]

    if not completed:
        # All failed, no transcripts at all
        logger.warning("Workflow %s: all tasks failed", workflow_id)
        wf_resp = db.table("workflows").update({
            "state": WorkflowState.FAILED,
        }).eq("id", workflow_id).execute()
        return wf_resp.data[0]

    # At least one completed — advance to extracting
    logger.info("Workflow %s: all tasks done (%d completed), advancing to extracting",
                workflow_id, len(completed))
    wf_resp = db.table("workflows").update({
        "state": WorkflowState.EXTRACTING,
    }).eq("id", workflow_id).execute()
    return wf_resp.data[0]


def get_workflow(workflow_id: str) -> dict | None:
    """Get workflow with its tasks."""
    db = get_supabase()

    wf_resp = db.table("workflows").select("*").eq("id", workflow_id).execute()
    if not wf_resp.data:
        return None
    workflow = wf_resp.data[0]

    tasks_resp = db.table("workflow_tasks").select("*").eq(
        "workflow_id", workflow_id
    ).order("created_at").execute()
    workflow["tasks"] = tasks_resp.data

    return workflow


def update_workflow_state(workflow_id: str, state: WorkflowState) -> dict:
    """Update workflow state."""
    db = get_supabase()
    resp = db.table("workflows").update({
        "state": state,
    }).eq("id", workflow_id).execute()
    return resp.data[0]


def update_workflow_extractions(workflow_id: str, extractions: dict) -> dict:
    """Update workflow extractions snapshot."""
    db = get_supabase()
    resp = db.table("workflows").update({
        "extractions": extractions,
    }).eq("id", workflow_id).execute()
    return resp.data[0]
