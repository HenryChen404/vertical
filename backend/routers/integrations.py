from fastapi import APIRouter
from pydantic import BaseModel
from models.schemas import IntegrationStatus

router = APIRouter()

crm_state = {"connected": False, "provider": None}
calendar_state = {"connected": False, "provider": None}


@router.get("/integrations/crm/status", response_model=IntegrationStatus)
def crm_status():
    return crm_state


class ConnectRequest(BaseModel):
    provider: str


@router.post("/integrations/crm/connect")
def connect_crm(req: ConnectRequest):
    crm_state["connected"] = True
    crm_state["provider"] = req.provider
    return {"success": True}


@router.get("/integrations/calendar/status", response_model=IntegrationStatus)
def calendar_status():
    return calendar_state


@router.post("/integrations/calendar/connect")
def connect_calendar(req: ConnectRequest):
    calendar_state["connected"] = True
    calendar_state["provider"] = req.provider
    return {"success": True}
