"""PLAUD OAuth client + JWT session management."""

from __future__ import annotations

import base64
import os
import logging
from datetime import datetime, timedelta, timezone

import httpx
import jwt

logger = logging.getLogger(__name__)

PLAUD_BASE_URL = "https://platform.plaud.ai/developer"
PLAUD_AUTH_URL = "https://app.plaud.ai/platform/oauth"
PLAUD_TOKEN_URL = f"{PLAUD_BASE_URL}/api/oauth/third-party/access-token"
PLAUD_USER_URL = f"{PLAUD_BASE_URL}/api/open/third-party/users/current"

SESSION_EXPIRY_DAYS = 7


def _get_credentials() -> tuple[str, str]:
    client_id = os.getenv("PLAUD_CLIENT_ID", "")
    client_secret = os.getenv("PLAUD_CLIENT_SECRET", "")
    return client_id, client_secret


def _get_session_secret() -> str:
    return os.getenv("SESSION_SECRET", "dev-secret-change-me")


def _basic_auth_header(client_id: str, client_secret: str) -> str:
    credentials = f"{client_id}:{client_secret}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return f"Basic {encoded}"


def get_oauth_url(redirect_uri: str) -> str:
    """Build PLAUD OAuth authorization URL."""
    client_id, _ = _get_credentials()
    return (
        f"{PLAUD_AUTH_URL}"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
    )


async def exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for access + refresh tokens.

    Returns: {"access_token": ..., "refresh_token": ..., "expires_in": ...}
    """
    client_id, client_secret = _get_credentials()
    auth_header = _basic_auth_header(client_id, client_secret)

    async with httpx.AsyncClient() as client:
        logger.info("Token exchange: url=%s, redirect_uri=%s", PLAUD_TOKEN_URL, redirect_uri)
        resp = await client.post(
            PLAUD_TOKEN_URL,
            headers={"Authorization": auth_header},
            data={
                "code": code,
                "redirect_uri": redirect_uri,
            },
        )
        if resp.status_code != 200:
            logger.error("Token exchange failed: status=%s, body=%s", resp.status_code, resp.text)
        resp.raise_for_status()
        return resp.json()


async def get_plaud_user(access_token: str) -> dict:
    """Fetch current user from PLAUD API.

    Returns: {"id": ..., "name": ..., "avatar_url": ..., ...}
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            PLAUD_USER_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        data = resp.json()
        # Handle nested response (e.g. {"data": {...}})
        return data.get("data", data) if isinstance(data, dict) else data


async def refresh_plaud_token(refresh_token: str) -> dict:
    """Refresh PLAUD access token.

    Returns: {"access_token": ..., "refresh_token": ..., "expires_in": ...}
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PLAUD_TOKEN_URL}/refresh",
            data={
                "refresh_token": refresh_token,
            },
        )
        resp.raise_for_status()
        return resp.json()


def create_session_token(user_id: str, plaud_user_id: str) -> str:
    """Issue an HS256 JWT session token (7-day expiry)."""
    secret = _get_session_secret()
    payload = {
        "user_id": user_id,
        "plaud_user_id": plaud_user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def verify_session_token(token: str) -> dict | None:
    """Verify JWT and return payload or None if invalid/expired."""
    secret = _get_session_secret()
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return {"id": payload["user_id"], "plaud_user_id": payload["plaud_user_id"]}
    except jwt.ExpiredSignatureError:
        logger.debug("Session token expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.debug("Invalid session token: %s", e)
        return None
