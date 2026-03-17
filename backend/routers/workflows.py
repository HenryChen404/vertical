"""Workflow API endpoints for CRM update workflow."""

from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from services.crm_graph import get_graph, start_langgraph
from services.transcription import transcribe_local, trigger_plaud_transcription
from services.workflow import (
    TaskState,
    TaskType,
    WorkflowState,
    create_workflow,
    get_workflow,
    on_task_completed,
    on_task_failed,
    update_workflow_extractions,
)

router = APIRouter()
logger = logging.getLogger(__name__)


# --- Request/Response models ---


class RecordingRef(BaseModel):
    type: str  # "plaud" | "local"
    id: str


class CreateWorkflowRequest(BaseModel):
    event_id: str
    recordings: list[RecordingRef]


class ChatRequest(BaseModel):
    message: str


class UpdateExtractionsRequest(BaseModel):
    extractions: dict


# --- Endpoints ---


@router.post("/workflows")
async def create_workflow_endpoint(
    req: CreateWorkflowRequest,
    background_tasks: BackgroundTasks,
):
    """Create a new CRM update workflow and start transcription."""
    recordings = [{"type": r.type, "id": r.id} for r in req.recordings]
    workflow = create_workflow(req.event_id, recordings)

    # Trigger transcription for each task
    for task in workflow["tasks"]:
        if task["type"] == TaskType.LOCAL:
            background_tasks.add_task(_run_local_transcription, task["id"], task["recording_id"])
        elif task["type"] == TaskType.PLAUD:
            background_tasks.add_task(_run_plaud_transcription, task["id"], task["recording_id"])

    return workflow


@router.get("/workflows/{workflow_id}")
async def get_workflow_endpoint(workflow_id: str):
    """Get workflow status with tasks."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.get("/workflows/{workflow_id}/stream")
async def stream_workflow_endpoint(workflow_id: str):
    """SSE stream for workflow progress updates."""

    async def event_generator():
        prev_state = None
        prev_task_states: dict[str, int] = {}

        while True:
            workflow = get_workflow(workflow_id)
            if not workflow:
                yield f"data: {json.dumps({'error': 'Workflow not found'})}\n\n"
                return

            current_state = workflow["state"]
            tasks = workflow.get("tasks", [])

            # Compute task progress
            total = len(tasks)
            completed = sum(1 for t in tasks if t["state"] == TaskState.COMPLETED)
            failed = sum(1 for t in tasks if t["state"] == TaskState.FAILED)
            task_states = {t["id"]: t["state"] for t in tasks}

            # Emit on state change or task progress change
            if current_state != prev_state or task_states != prev_task_states:
                event = {
                    "workflow_state": current_state,
                    "tasks_total": total,
                    "tasks_completed": completed,
                    "tasks_failed": failed,
                }

                if current_state == WorkflowState.TRANSCRIBING:
                    event["message"] = f"Transcribing: {completed}/{total} completed"
                elif current_state == WorkflowState.EXTRACTING:
                    event["message"] = "Extracting CRM data from transcripts..."
                    event["extractions"] = workflow.get("extractions", {})
                elif current_state == WorkflowState.REVIEW:
                    event["message"] = "Ready for review"
                    event["extractions"] = workflow.get("extractions", {})
                elif current_state == WorkflowState.PUSHING:
                    event["message"] = "Pushing to CRM..."
                elif current_state == WorkflowState.DONE:
                    event["message"] = "CRM update complete"
                    yield f"data: {json.dumps(event)}\n\n"
                    return
                elif current_state == WorkflowState.FAILED:
                    event["message"] = "Workflow failed"
                    yield f"data: {json.dumps(event)}\n\n"
                    return

                yield f"data: {json.dumps(event)}\n\n"
                prev_state = current_state
                prev_task_states = task_states

            await asyncio.sleep(2)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/workflows/{workflow_id}/chat")
async def chat_endpoint(workflow_id: str, req: ChatRequest):
    """Resume LangGraph with user message (review chat)."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    from langgraph.types import Command

    graph = await get_graph()
    result = await graph.ainvoke(
        Command(resume=req.message),
        config={"configurable": {"thread_id": workflow_id}},
    )

    return {
        "extractions": result.get("extractions", {}),
        "messages": result.get("messages", []),
        "should_push": result.get("should_push", False),
    }


@router.put("/workflows/{workflow_id}/extractions")
async def update_extractions_endpoint(workflow_id: str, req: UpdateExtractionsRequest):
    """Direct edit of extractions (Edit Mode)."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    updated = update_workflow_extractions(workflow_id, req.extractions)
    return updated


@router.post("/workflows/{workflow_id}/confirm")
async def confirm_endpoint(workflow_id: str, background_tasks: BackgroundTasks):
    """Confirm and push extractions to CRM."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    # Resume LangGraph with confirm_and_push
    from langgraph.types import Command

    graph = await get_graph()
    background_tasks.add_task(
        graph.ainvoke,
        Command(resume="confirm_and_push"),
        {"configurable": {"thread_id": workflow_id}},
    )

    return {"status": "pushing"}


# --- Background task helpers ---


async def _run_local_transcription(task_id: str, recording_id: str) -> None:
    """Background: transcribe a local recording and update workflow."""
    from services.supabase import get_supabase

    db = get_supabase()
    db.table("workflow_tasks").update({"state": TaskState.TRANSCRIBING}).eq("id", task_id).execute()

    try:
        transcript = await transcribe_local(recording_id)
        workflow = on_task_completed(task_id, transcript)

        # If all tasks done, start LangGraph
        if workflow["state"] == WorkflowState.EXTRACTING:
            await start_langgraph(workflow["id"])
    except Exception as e:
        logger.error("Local transcription failed for task %s: %s", task_id, e)
        on_task_failed(task_id, str(e))


async def _run_plaud_transcription(task_id: str, recording_id: str) -> None:
    """Background: trigger PLAUD transcription API."""
    from services.supabase import get_supabase

    db = get_supabase()
    db.table("workflow_tasks").update({"state": TaskState.TRANSCRIBING}).eq("id", task_id).execute()

    try:
        await trigger_plaud_transcription(recording_id)
    except Exception as e:
        logger.error("PLAUD transcription trigger failed for task %s: %s", task_id, e)
        on_task_failed(task_id, str(e))
