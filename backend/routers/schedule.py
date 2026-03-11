import asyncio
import json

from fastapi import APIRouter, HTTPException
from starlette.responses import StreamingResponse

from models.schemas import MeetingDetail
from mock_data.schedule import MEETINGS, TRANSCRIPT_LINES

router = APIRouter()


@router.get("/schedule/{meeting_id}", response_model=MeetingDetail)
def get_meeting(meeting_id: str):
    meeting = MEETINGS.get(meeting_id)
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return meeting


@router.post("/schedule/{meeting_id}/recording/start")
def start_recording(meeting_id: str):
    return {"success": True}


@router.post("/schedule/{meeting_id}/recording/stop")
def stop_recording(meeting_id: str):
    return {"success": True}


@router.get("/schedule/{meeting_id}/recording/stream")
async def stream_recording(meeting_id: str):
    async def event_generator():
        for line in TRANSCRIPT_LINES:
            data = {
                "type": "transcript",
                "speaker": line["speaker"],
                "text": line["text"],
                "timestamp": line["timestamp"],
            }
            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(2.0)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
