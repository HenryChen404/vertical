"""Workflow API endpoints for CRM update workflow."""

from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from middleware.auth import get_current_user
from services.crm_service import chat_review, push_to_crm, run_extraction
from services.messages import MessageRole, add_message, get_messages
from services.transcription import transcribe_plaud_recording
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
    event_id: str | None = None
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
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Create a new CRM update workflow and start transcription."""
    recordings = [{"type": r.type, "id": r.id} for r in req.recordings]
    user_id = user["id"] if user["id"] != "demo_user" else None
    workflow = create_workflow(req.event_id, recordings, user_id=user_id)

    # Initial assistant message
    add_message(workflow["id"], MessageRole.ASSISTANT, {
        "text": "Starting transcription...",
    })

    # Trigger transcription for each task
    for task in workflow["tasks"]:
        background_tasks.add_task(
            _run_transcription, task["id"], task["recording_id"], user["id"]
        )

    return workflow


@router.get("/workflows/{workflow_id}")
async def get_workflow_endpoint(
    workflow_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get workflow status with tasks."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return workflow


@router.get("/workflows/{workflow_id}/messages")
async def get_messages_endpoint(
    workflow_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Get all messages for a workflow."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return get_messages(workflow_id)


@router.get("/workflows/{workflow_id}/stream")
async def stream_workflow_endpoint(
    workflow_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
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
async def chat_endpoint(
    workflow_id: str,
    req: ChatRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Chat with Gemini to review/modify extractions."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    result = await chat_review(workflow_id, req.message)

    return {
        "extractions": result.get("extractions", {}),
        "messages": result.get("messages", []),
        "should_push": result.get("should_push", False),
    }


@router.put("/workflows/{workflow_id}/extractions")
async def update_extractions_endpoint(
    workflow_id: str,
    req: UpdateExtractionsRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Direct edit of extractions (Edit Mode)."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    updated = update_workflow_extractions(workflow_id, req.extractions)
    return updated


@router.post("/workflows/{workflow_id}/confirm")
async def confirm_endpoint(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Confirm and push extractions to CRM."""
    workflow = get_workflow(workflow_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow["state"] != WorkflowState.REVIEW:
        raise HTTPException(status_code=400, detail="Workflow not in review state")

    background_tasks.add_task(push_to_crm, workflow_id)
    return {"status": "pushing"}


# --- Background task helpers ---


async def _run_transcription(task_id: str, recording_id: str, user_id: str) -> None:
    """Background: fetch PLAUD presigned URL → ElevenLabs STT → complete task.

    Two modes based on ELEVENLABS_WEBHOOK_ID env var:
    - Webhook mode (recommended): triggers async transcription, result arrives
      via POST /api/webhooks/elevenlabs/transcription.
    - Sync mode (fallback): blocks until ElevenLabs returns the transcript.
    """
    from services.supabase import get_supabase

    db = get_supabase()
    db.table("workflow_tasks").update({"state": TaskState.TRANSCRIBING}).eq("id", task_id).execute()

    # Look up plaud_file_id from recordings table
    rec_resp = db.table("recordings").select("plaud_file_id").eq("id", recording_id).execute()
    if not rec_resp.data or not rec_resp.data[0].get("plaud_file_id"):
        on_task_failed(task_id, f"Recording {recording_id} has no plaud_file_id")
        return

    plaud_file_id = rec_resp.data[0]["plaud_file_id"]
    use_webhook = bool(os.getenv("ELEVENLABS_WEBHOOK_ID"))

    try:
        transcript = await transcribe_plaud_recording(
            plaud_file_id,
            user_id,
            task_id=task_id,
            use_webhook=use_webhook,
        )

        if transcript:
            # Sync mode — we got the result directly
            workflow = on_task_completed(task_id, transcript)
            if workflow["state"] == WorkflowState.EXTRACTING:
                add_message(workflow["id"], MessageRole.ASSISTANT, {
                    "text": "Transcription complete. Starting analysis...",
                })
                await run_extraction(workflow["id"])
        # else: webhook mode — result will arrive via webhook endpoint

    except Exception as e:
        logger.error("Transcription failed for task %s: %s", task_id, e, exc_info=True)
        on_task_failed(task_id, str(e))
