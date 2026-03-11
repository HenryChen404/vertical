from fastapi import APIRouter
from models.schemas import ScheduleResponse
from mock_data.sales import SCHEDULE

router = APIRouter()


@router.get("/sales/schedule", response_model=ScheduleResponse)
def get_schedule():
    return SCHEDULE
