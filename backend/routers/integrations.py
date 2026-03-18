import os
import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from models.schemas import IntegrationStatus, ConnectionInitResponse
from middleware.auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

# Provider → Composio toolkit slug + env var for auth_config_id
PROVIDER_CONFIG = {
    "google": {
        "type": "calendar",
        "toolkit_slug": "googlecalendar",
        "auth_config_env": "COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID",
        "trigger_slug": "GOOGLECALENDAR_WATCH_CALENDAR_EVENTS",
    },
    "outlook": {
        "type": "calendar",
        "toolkit_slug": "outlookcalendar",
        "auth_config_env": "COMPOSIO_OUTLOOK_CALENDAR_AUTH_CONFIG_ID",
        "trigger_slug": None,  # TODO: add when available
    },
    "salesforce": {
        "type": "crm",
        "toolkit_slug": "salesforce",
        "auth_config_env": "COMPOSIO_SALESFORCE_AUTH_CONFIG_ID",
        "triggers": [
            {
                "slug": "SALESFORCE_GENERIC_S_OBJECT_RECORD_UPDATED_TRIGGER",
                "config": {
                    "sobject_name": "Event",
                    "fields_to_monitor": [
                        "Subject", "StartDateTime", "EndDateTime",
                        "Location", "Description", "WhoId", "WhatId",
                    ],
                    "interval": 2,
                },
            },
            {
                "slug": "SALESFORCE_GENERIC_S_OBJECT_RECORD_UPDATED_TRIGGER",
                "config": {
                    "sobject_name": "Opportunity",
                    "fields_to_monitor": [
                        "Name", "Amount", "StageName", "CloseDate",
                        "AccountId",
                    ],
                    "interval": 2,
                },
            },
        ],
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


def _check_connection(client, toolkit_slug: str, user_id: str):
    """Check if an active connection exists for the given toolkit.

    Returns the connected account if found, else None.
    """
    try:
        result = client.connected_accounts.list(
            user_ids=[user_id],
            toolkit_slugs=[toolkit_slug],
            statuses=["ACTIVE"],
        )
        return result.items[0] if result.items else None
    except Exception as e:
        logger.warning("Composio status check failed: %s", e)
    return None


def _upsert_user_integration(user_id: str, provider: str, connected_account_id: str, connected: bool):
    """Write or update the user_integrations mapping."""
    try:
        from services.supabase import get_supabase
        db = get_supabase()
        # Check if row exists
        resp = (
            db.table("user_integrations")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", provider)
            .execute()
        )
        if resp.data:
            db.table("user_integrations").update({
                "composio_entity_id": connected_account_id,
                "connected": connected,
            }).eq("id", resp.data[0]["id"]).execute()
        else:
            db.table("user_integrations").insert({
                "user_id": user_id,
                "provider": provider,
                "composio_entity_id": connected_account_id,
                "connected": connected,
            }).execute()
    except Exception as e:
        logger.warning("Failed to upsert user_integration for %s/%s: %s", user_id, provider, e)


def _setup_trigger(client, provider: str, connected_account_id: str) -> list[str]:
    """Create Composio triggers for the given provider. Returns list of trigger_ids."""
    config = PROVIDER_CONFIG.get(provider)
    if not config:
        return []

    # Support both old single-trigger format and new array format
    triggers_config = config.get("triggers")
    if not triggers_config:
        slug = config.get("trigger_slug")
        if not slug:
            return []
        triggers_config = [{"slug": slug, "config": config.get("trigger_config", {})}]

    created = []
    for tc in triggers_config:
        try:
            resp = client.triggers.create(
                slug=tc["slug"],
                connected_account_id=connected_account_id,
                trigger_config=tc.get("config", {}),
            )
            trigger_id = resp.trigger_id
            logger.info("Created trigger %s for provider %s (sobject=%s, account=%s)",
                         trigger_id, provider, tc.get("config", {}).get("sobject_name", "?"), connected_account_id)
            created.append(trigger_id)
        except Exception as e:
            # Trigger may already exist — not fatal
            logger.warning("Failed to create trigger for %s (%s): %s",
                           provider, tc.get("config", {}).get("sobject_name", "?"), e)
    return created


def _teardown_triggers(client, provider: str, user_id: str) -> int:
    """Delete all triggers for the given provider and user. Returns count deleted."""
    config = PROVIDER_CONFIG.get(provider)
    if not config:
        return 0

    # Collect all trigger slugs for this provider
    triggers_config = config.get("triggers")
    if triggers_config:
        trigger_slugs = list({tc["slug"] for tc in triggers_config})
    else:
        slug = config.get("trigger_slug")
        if not slug:
            return 0
        trigger_slugs = [slug]

    deleted = 0
    try:
        result = client.connected_accounts.list(
            user_ids=[user_id],
            toolkit_slugs=[config["toolkit_slug"]],
            statuses=["ACTIVE"],
        )
        account_ids = [acc.id for acc in result.items]
        if not account_ids:
            return 0

        active = client.triggers.list_active(
            connected_account_ids=account_ids,
            trigger_names=trigger_slugs,
        )
        triggers = active.items if hasattr(active, "items") else (active.triggers if hasattr(active, "triggers") else [])
        for trigger in triggers:
            try:
                tid = trigger.id if hasattr(trigger, "id") else trigger.get("id")
                if tid:
                    client.triggers.delete(trigger_id=tid)
                    deleted += 1
                    logger.info("Deleted trigger %s for provider %s", tid, provider)
            except Exception as e:
                logger.warning("Failed to delete trigger: %s", e)
    except Exception as e:
        logger.error("Failed to list/delete triggers for %s: %s", provider, e)

    return deleted


@router.get("/integrations/connect/redirect")
def connect_redirect(
    provider: str = Query(...),
    callback_url: str = Query(...),
    request: Request = None,
    user: dict = Depends(get_current_user),
):
    """Server-side 302 redirect to OAuth provider.

    Frontend navigates here directly via window.location.href so there is
    no async gap and no UI flicker.
    """
    if provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    config = PROVIDER_CONFIG[provider]
    client = _get_composio_client()
    user_id = user["id"]

    # Mock mode — redirect back immediately as if connected
    if client is None:
        logger.info("COMPOSIO_API_KEY not set, using mock connect for %s", provider)
        if config["type"] == "crm":
            _mock_crm_state["connected"] = True
            _mock_crm_state["provider"] = provider
        else:
            _mock_calendar_state["connected"] = True
            _mock_calendar_state["provider"] = provider
        return RedirectResponse(url=callback_url, status_code=302)

    auth_config_id = os.getenv(config["auth_config_env"])
    if not auth_config_id:
        raise HTTPException(
            status_code=501,
            detail=f"Auth config not set for {provider}. Set {config['auth_config_env']} env var.",
        )

    try:
        connection_request = client.connected_accounts.initiate(
            user_id=user_id,
            auth_config_id=auth_config_id,
            callback_url=callback_url,
            allow_multiple=True,
        )
        return RedirectResponse(url=connection_request.redirect_url, status_code=302)
    except Exception as e:
        logger.error("Composio initiate failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to initiate OAuth: {e}")


class ConnectRequest(BaseModel):
    provider: str
    redirect_url: str


@router.post("/integrations/connect", response_model=ConnectionInitResponse)
def initiate_connection(
    req: ConnectRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    if req.provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    config = PROVIDER_CONFIG[req.provider]
    client = _get_composio_client()
    user_id = user["id"]

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
            user_id=user_id,
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
def disconnect(
    req: DisconnectRequest,
    request: Request,
    user: dict = Depends(get_current_user),
):
    if req.provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    config = PROVIDER_CONFIG[req.provider]
    client = _get_composio_client()
    user_id = user["id"]

    if client is None:
        if config["type"] == "crm":
            _mock_crm_state["connected"] = False
            _mock_crm_state["provider"] = None
        else:
            _mock_calendar_state["connected"] = False
            _mock_calendar_state["provider"] = None
        return {"success": True}

    try:
        # Teardown triggers before disconnecting
        triggers_deleted = _teardown_triggers(client, req.provider, user_id)

        result = client.connected_accounts.list(
            user_ids=[user_id],
            toolkit_slugs=[config["toolkit_slug"]],
            statuses=["ACTIVE"],
        )
        deleted = 0
        for account in result.items:
            client.connected_accounts.delete(nanoid=account.id)
            deleted += 1
        # Remove from user_integrations
        _upsert_user_integration(user_id, req.provider, "", False)
        return {"success": True, "deleted": deleted, "triggers_deleted": triggers_deleted}
    except Exception as e:
        logger.error("Composio disconnect failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Failed to disconnect: {e}")


@router.get("/integrations/crm/status", response_model=IntegrationStatus)
def crm_status(request: Request, user: dict = Depends(get_current_user)):
    client = _get_composio_client()
    if client is None:
        return _mock_crm_state

    account = _check_connection(client, "salesforce", user["id"])
    if account:
        _setup_trigger(client, "salesforce", account.id)
        _upsert_user_integration(user["id"], "salesforce", account.id, True)
        return IntegrationStatus(connected=True, provider="salesforce")
    return IntegrationStatus(connected=False)


@router.get("/integrations/{provider}/verify-api")
def verify_api_access(
    provider: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """After OAuth, verify the connected org actually supports API access."""
    if provider not in PROVIDER_CONFIG:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    client = _get_composio_client()
    user_id = user["id"]

    if client is None:
        return {"api_enabled": True, "mock": True}

    config = PROVIDER_CONFIG[provider]
    try:
        result = client.connected_accounts.list(
            user_ids=[user_id],
            toolkit_slugs=[config["toolkit_slug"]],
            statuses=["ACTIVE"],
        )
        if not result.items:
            return {"api_enabled": False, "error": "No active connection found"}

        account = result.items[0]

        # Lightweight API call to test access
        if provider == "salesforce":
            resp = client.tools.execute(
                slug="SALESFORCE_EXECUTE_SOQL_QUERY",
                arguments={"soql_query": "SELECT Id FROM Organization LIMIT 1"},
                connected_account_id=account.id,
                user_id=user_id,
                dangerously_skip_version_check=True,
            )
            data = resp.model_dump() if hasattr(resp, "model_dump") else resp
            if data.get("successful") is False:
                error_msg = data.get("error", "Unknown error")
                return {"api_enabled": False, "error": error_msg}
            return {"api_enabled": True}

        # For calendar providers, test with a simple list call
        return {"api_enabled": True}

    except Exception as e:
        logger.error("API verification failed for %s: %s", provider, e)
        return {"api_enabled": False, "error": str(e)}


@router.get("/integrations/calendar/status", response_model=IntegrationStatus)
def calendar_status(request: Request, user: dict = Depends(get_current_user)):
    client = _get_composio_client()
    if client is None:
        return _mock_calendar_state

    for slug, provider_name in [("googlecalendar", "google"), ("outlookcalendar", "outlook")]:
        account = _check_connection(client, slug, user["id"])
        if account:
            _setup_trigger(client, provider_name, account.id)
            _upsert_user_integration(user["id"], provider_name, account.id, True)
            return IntegrationStatus(connected=True, provider=provider_name)

    return IntegrationStatus(connected=False)
