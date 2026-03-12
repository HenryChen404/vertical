import os
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from models.schemas import IntegrationStatus, ConnectionInitResponse

router = APIRouter()
logger = logging.getLogger(__name__)

USER_ID = "demo_user"

# Provider → Composio toolkit slug + env var for auth_config_id
PROVIDER_CONFIG = {
    "google": {
        "type": "calendar",
        "toolkit_slug": "googlecalendar",
        "auth_config_env": "COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID",
    },
    "outlook": {
        "type": "calendar",
        "toolkit_slug": "outlookcalendar",
        "auth_config_env": "COMPOSIO_OUTLOOK_CALENDAR_AUTH_CONFIG_ID",
    },
    "salesforce": {
        "type": "crm",
        "toolkit_slug": "salesforce",
        "auth_config_env": "COMPOSIO_SALESFORCE_AUTH_CONFIG_ID",
    },
}

# Fallback in-memory state (used when COMPOSIO_API_KEY is not set)
_mock_crm_state = {"connected": False, "provider": None}
_mock_calendar_state = {"connected": False, "provider": None}


def _get_composio_client():
    """Return Composio client if API key is configured, else None."""
    api_key = os.getenv("COMPOSIO_API_KEY")
    if not api_key:
        return None
    from composio import Composio
    return Composio(api_key=api_key)


def _check_connection(client, toolkit_slug: str) -> bool:
    """Check if an active connection exists for the given toolkit."""
    try:
        result = client.connected_accounts.list(
            user_ids=[USER_ID],
            toolkit_slugs=[toolkit_slug],
            statuses=["ACTIVE"],
        )
        return bool(result.items)
    except Exception as e:
        logger.warning("Composio status check failed: %s", e)
    return False


class ConnectRequest(BaseModel):
    provider: str
    redirect_url: str


@router.post("/integrations/connect", response_model=ConnectionInitResponse)
def initiate_connection(req: ConnectRequest):
    if req.provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    config = PROVIDER_CONFIG[req.provider]
    client = _get_composio_client()

    # Fallback: no Composio key → mock behavior
    if client is None:
        logger.info("COMPOSIO_API_KEY not set, using mock connect for %s", req.provider)
        if config["type"] == "crm":
            _mock_crm_state["connected"] = True
            _mock_crm_state["provider"] = req.provider
        else:
            _mock_calendar_state["connected"] = True
            _mock_calendar_state["provider"] = req.provider
        return ConnectionInitResponse(success=True)

    auth_config_id = os.getenv(config["auth_config_env"])
    if not auth_config_id:
        raise HTTPException(
            status_code=501,
            detail=f"Auth config not set for {req.provider}. Set {config['auth_config_env']} env var.",
        )

    try:
        connection_request = client.connected_accounts.initiate(
            user_id=USER_ID,
            auth_config_id=auth_config_id,
            callback_url=req.redirect_url,
            allow_multiple=True,
        )
        return ConnectionInitResponse(
            redirect_url=connection_request.redirect_url,
            connected_account_id=connection_request.id,
        )
    except Exception as e:
        logger.error("Composio initiate failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to initiate OAuth: {e}")


class DisconnectRequest(BaseModel):
    provider: str


@router.post("/integrations/disconnect")
def disconnect(req: DisconnectRequest):
    if req.provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    config = PROVIDER_CONFIG[req.provider]
    client = _get_composio_client()

    if client is None:
        if config["type"] == "crm":
            _mock_crm_state["connected"] = False
            _mock_crm_state["provider"] = None
        else:
            _mock_calendar_state["connected"] = False
            _mock_calendar_state["provider"] = None
        return {"success": True}

    try:
        result = client.connected_accounts.list(
            user_ids=[USER_ID],
            toolkit_slugs=[config["toolkit_slug"]],
            statuses=["ACTIVE"],
        )
        deleted = 0
        for account in result.items:
            client.connected_accounts.delete(nanoid=account.id)
            deleted += 1
        return {"success": True, "deleted": deleted}
    except Exception as e:
        logger.error("Composio disconnect failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to disconnect: {e}")


@router.get("/integrations/crm/status", response_model=IntegrationStatus)
def crm_status():
    client = _get_composio_client()
    if client is None:
        return _mock_crm_state

    connected = _check_connection(client, "salesforce")
    return IntegrationStatus(connected=connected, provider="salesforce" if connected else None)


@router.get("/integrations/calendar/status", response_model=IntegrationStatus)
def calendar_status():
    client = _get_composio_client()
    if client is None:
        return _mock_calendar_state

    for slug, provider_name in [("googlecalendar", "google"), ("outlookcalendar", "outlook")]:
        if _check_connection(client, slug):
            return IntegrationStatus(connected=True, provider=provider_name)

    return IntegrationStatus(connected=False)
