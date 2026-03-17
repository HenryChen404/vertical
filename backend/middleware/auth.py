"""FastAPI auth dependencies."""

from __future__ import annotations

import os
from fastapi import HTTPException, Request

from services.auth import verify_session_token


def _is_auth_enabled() -> bool:
    """Auth is enabled when PLAUD_CLIENT_ID is configured."""
    return bool(os.getenv("PLAUD_CLIENT_ID"))


def get_current_user(request: Request) -> dict:
    """Extract user from session cookie. Returns {"id": uuid, "plaud_user_id": str} or raises 401.

    When PLAUD_CLIENT_ID is not set (dev mode), returns a demo user.
    """
    if not _is_auth_enabled():
        return {"id": "demo_user", "plaud_user_id": "demo_user"}

    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = verify_session_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return user


def get_optional_user(request: Request) -> dict | None:
    """Same as get_current_user but returns None instead of 401.

    When PLAUD_CLIENT_ID is not set (dev mode), returns a demo user.
    """
    if not _is_auth_enabled():
        return {"id": "demo_user", "plaud_user_id": "demo_user"}

    token = request.cookies.get("session")
    if not token:
        return None

    return verify_session_token(token)
