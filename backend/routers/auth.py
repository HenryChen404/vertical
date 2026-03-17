"""Auth endpoints: PLAUD OAuth login/callback/logout/me."""

from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import RedirectResponse

from middleware.auth import get_current_user
from services.auth import (
    create_session_token,
    exchange_code,
    get_oauth_url,
    get_plaud_user,
)
from services.supabase import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

SESSION_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")


def _get_backend_callback_url(request: Request) -> str:
    """Build the backend callback URL from the current request.
    Use BACKEND_URL env var on production to avoid http→https downgrade by reverse proxy."""
    base = os.getenv("BACKEND_URL") or str(request.base_url).rstrip("/")
    return base.rstrip("/") + "/api/auth/callback"


def _is_page_navigation(request: Request) -> bool:
    """Check if this is a real browser navigation (not XHR)."""
    return request.headers.get("sec-fetch-mode") == "navigate"


@router.get("/auth/login")
def login(request: Request):
    """Return PLAUD OAuth authorization URL (redirect_uri points to backend)."""
    if not os.getenv("PLAUD_CLIENT_ID"):
        raise HTTPException(status_code=501, detail="PLAUD OAuth not configured")
    callback_url = _get_backend_callback_url(request)
    url = get_oauth_url(callback_url)
    return {"url": url}


@router.get("/auth/callback")
async def callback(
    request: Request,
    code: str = Query(...),
    state: str = Query(""),
):
    """OAuth callback: PLAUD redirects here with ?code=xxx.

    PLAUD's authorize page hits this endpoint TWICE for the same code:
    1) XHR (Sec-Fetch-Mode: cors) — we return 200 empty, don't consume code
    2) Page navigation (Sec-Fetch-Mode: navigate) — we process the code here
    """
    if not os.getenv("PLAUD_CLIENT_ID"):
        raise HTTPException(status_code=501, detail="PLAUD OAuth not configured")

    # If this is an XHR from PLAUD's SPA, return 200 without consuming the code.
    # The real page navigation will follow and process it.
    if not _is_page_navigation(request):
        logger.info("Callback via XHR, skipping code exchange (waiting for page navigation)")
        return {"status": "ok"}

    callback_url = _get_backend_callback_url(request)

    try:
        # Exchange code for tokens
        tokens = await exchange_code(code, callback_url)
        access_token = tokens["access_token"]
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)

        # Fetch PLAUD user profile
        plaud_user = await get_plaud_user(access_token)
        plaud_user_id = str(plaud_user.get("id", plaud_user.get("userId", "")))
        name = plaud_user.get("name", plaud_user.get("nickname", ""))
        avatar_url = plaud_user.get("avatar_url", plaud_user.get("avatarUrl", ""))

        if not plaud_user_id:
            return RedirectResponse(f"{FRONTEND_URL}/login?error=no_user_id")

        # Upsert user in database
        db = get_supabase()
        expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()

        existing = db.table("users").select("id").eq("plaud_user_id", plaud_user_id).execute()

        if existing.data:
            user_id = existing.data[0]["id"]
            db.table("users").update({
                "name": name,
                "avatar_url": avatar_url,
                "plaud_access_token": access_token,
                "plaud_refresh_token": refresh_token,
                "plaud_token_expires_at": expires_at,
            }).eq("id", user_id).execute()
        else:
            insert_resp = db.table("users").insert({
                "plaud_user_id": plaud_user_id,
                "name": name,
                "avatar_url": avatar_url,
                "plaud_access_token": access_token,
                "plaud_refresh_token": refresh_token,
                "plaud_token_expires_at": expires_at,
            }).execute()
            user_id = insert_resp.data[0]["id"]

        # Issue session JWT
        session_token = create_session_token(str(user_id), plaud_user_id)

        logger.info("OAuth callback success: user_id=%s, name=%s", user_id, name)

        is_production = bool(os.getenv("BACKEND_URL"))
        response = RedirectResponse(f"{FRONTEND_URL}/files?syncing=1", status_code=302)
        response.set_cookie(
            key="session",
            value=session_token,
            httponly=True,
            samesite="none" if is_production else "lax",
            secure=is_production,
            max_age=SESSION_MAX_AGE,
            path="/",
        )
        return response

    except Exception as e:
        logger.error("OAuth callback failed: %s", e, exc_info=True)
        return RedirectResponse(f"{FRONTEND_URL}/login?error=callback_failed")


@router.post("/auth/logout")
def logout(response: Response):
    """Clear session cookie."""
    response.delete_cookie(key="session", path="/")
    return {"success": True}


@router.get("/auth/me")
def me(request: Request):
    """Return current user info."""
    user = get_current_user(request)

    if user["id"] == "demo_user":
        return {"id": "demo_user", "name": "Demo User", "authenticated": False}

    db = get_supabase()
    resp = db.table("users").select("id, plaud_user_id, name, avatar_url, created_at").eq(
        "id", user["id"]
    ).execute()

    if not resp.data:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = resp.data[0]
    return {**user_data, "authenticated": True}
