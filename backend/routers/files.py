from fastapi import APIRouter
from models.schemas import RecordingFile
from mock_data.files import RECORDINGS

router = APIRouter()


@router.get("/files", response_model=list[RecordingFile])
def list_files():
    return RECORDINGS
