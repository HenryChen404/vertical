# PLAUD Auth + Multi-user Implementation Plan

## Overview

Integrate PLAUD OAuth login to replace the hardcoded `demo_user`, enabling real multi-user support. Every user authenticates via PLAUD, and all data (events, integrations, files) is scoped to their `user_id`.

## PLAUD Developer Platform

### Credentials (Test)

- **Client ID**: `client_cf5b6c7d-e717-4522-87bf-6d9ed46009b8`
- **Client Secret**: `sk_g8JDZe3oGDxk_vbg4OYm4WloHv1PH8M8fldiGtq8MW0`
- **Base URL**: `https://platform.plaud.ai/developer`

### OAuth Flow

```
Step 1: Redirect to PLAUD Authorization
  GET https://app.plaud.ai/platform/oauth
    ?client_id={client_id}
    &redirect_uri={redirect_uri}
    &response_type=code

Step 2: Exchange code for tokens (backend only, uses Basic auth)
  POST https://platform.plaud.ai/developer/api/oauth/third-party/access-token
    Authorization: Basic base64(client_id:client_secret)
    Content-Type: application/x-www-form-urlencoded
    Body: code={code}&redirect_uri={redirect_uri}

  Response: { access_token, refresh_token, expires_in, ... }

Step 3: Call PLAUD APIs with Bearer token
  GET https://platform.plaud.ai/developer/api/open/third-party/users/current
    Authorization: Bearer {access_token}

Refresh token:
  POST https://platform.plaud.ai/developer/api/oauth/third-party/access-token/refresh
    Content-Type: application/x-www-form-urlencoded
    Body: refresh_token={refresh_token}
```

### Available PLAUD APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/open/third-party/users/current` | Get current user info |
| POST | `/open/third-party/users/current/revoke` | Revoke user authorization |
| GET | `/open/third-party/files/` | Get user's recording file list |
| GET | `/open/third-party/files/{file_id}` | Get single file details |

---

## Architecture

### Authentication Flow

```
Frontend                          Backend                         PLAUD Platform
   |                                |                                |
   |  1. Click "Login with PLAUD"   |                                |
   |------------------------------->|                                |
   |  GET /api/auth/login           |                                |
   |  (returns PLAUD OAuth URL)     |                                |
   |                                |                                |
   |  2. Redirect to PLAUD          |                                |
   |--------------------------------------------------------------->|
   |                                |   3. User authorizes           |
   |  4. Callback with ?code=xxx    |                                |
   |<---------------------------------------------------------------|
   |                                |                                |
   |  5. POST /api/auth/callback    |                                |
   |    { code }                    |                                |
   |------------------------------->|                                |
   |                                |  6. Exchange code for tokens   |
   |                                |------------------------------->|
   |                                |  { access_token, refresh }     |
   |                                |<-------------------------------|
   |                                |                                |
   |                                |  7. GET /users/current         |
   |                                |------------------------------->|
   |                                |  { plaud_user_id, name, ... }  |
   |                                |<-------------------------------|
   |                                |                                |
   |                                |  8. Upsert users table         |
   |                                |  9. Issue session JWT          |
   |                                |                                |
   |  10. Set-Cookie: session=jwt   |                                |
   |<-------------------------------|                                |
   |                                |                                |
   |  11. All API calls include     |                                |
   |      Cookie: session=jwt       |                                |
   |------------------------------->|  12. Middleware extracts        |
   |                                |      user_id from JWT          |
```

### Session Strategy

- **Backend issues its own JWT** (not PLAUD's access_token) after successful OAuth
- JWT payload: `{ user_id: uuid, plaud_user_id: string, exp: timestamp }`
- Stored in **HttpOnly cookie** (secure, SameSite=Lax)
- JWT secret: `SESSION_SECRET` env var
- Token expiry: 7 days (refresh by re-exchanging PLAUD refresh_token)
- PLAUD tokens (access + refresh) stored encrypted in `users` table, used only for API calls

### Why not pass PLAUD access_token directly?

1. PLAUD token expiry may be short — our session can be longer
2. Avoids exposing PLAUD token to frontend
3. Decouples our auth from PLAUD's token lifecycle

---

## Database Changes

### New Migration: `20260317000000_add_users.sql`

```sql
-- Users table (stores PLAUD OAuth users)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plaud_user_id TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  plaud_access_token TEXT,       -- encrypted at rest
  plaud_refresh_token TEXT,      -- encrypted at rest
  plaud_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_users_plaud_user_id ON users(plaud_user_id);

-- Trigger for updated_at
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Add user_id to events
ALTER TABLE events ADD COLUMN user_id UUID REFERENCES users(id);
CREATE INDEX idx_events_user_id ON events(user_id);

-- Add user_id to event_sources
ALTER TABLE event_sources ADD COLUMN user_id UUID REFERENCES users(id);

-- Store per-user Composio entity mapping
-- (each user gets their own Composio connected_accounts)
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,         -- 'google', 'outlook', 'salesforce'
  composio_entity_id TEXT,        -- Composio user entity ID (= our user.id)
  connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, provider)
);
```

### Data Migration Strategy

Existing data (from `demo_user`) will have `user_id = NULL`. Options:
1. Leave as-is, filter by `user_id` in queries (NULL = legacy demo data)
2. Create a "demo" user row and backfill — do this if keeping demo mode

---

## Backend Changes

### New Files

#### `backend/services/auth.py` — PLAUD OAuth + session management

```python
"""PLAUD OAuth client and session JWT management."""

import os
import base64
import httpx
import jwt
from datetime import datetime, timedelta, timezone

PLAUD_BASE = "https://platform.plaud.ai/developer"
PLAUD_AUTH_URL = "https://app.plaud.ai/platform/oauth"

CLIENT_ID = os.getenv("PLAUD_CLIENT_ID")
CLIENT_SECRET = os.getenv("PLAUD_CLIENT_SECRET")
SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-me")
SESSION_EXPIRY_DAYS = 7

def get_oauth_url(redirect_uri: str) -> str:
    """Build PLAUD OAuth authorization URL."""
    return (
        f"{PLAUD_AUTH_URL}"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
    )

async def exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for access + refresh tokens."""
    credentials = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PLAUD_BASE}/api/oauth/third-party/access-token",
            headers={
                "Authorization": f"Basic {credentials}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data={"code": code, "redirect_uri": redirect_uri},
        )
        resp.raise_for_status()
        return resp.json()

async def get_plaud_user(access_token: str) -> dict:
    """Fetch current user profile from PLAUD."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLAUD_BASE}/api/open/third-party/users/current",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()

async def refresh_plaud_token(refresh_token: str) -> dict:
    """Refresh PLAUD access token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{PLAUD_BASE}/api/oauth/third-party/access-token/refresh",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"refresh_token": refresh_token},
        )
        resp.raise_for_status()
        return resp.json()

def create_session_token(user_id: str, plaud_user_id: str) -> str:
    """Issue a session JWT."""
    payload = {
        "user_id": user_id,
        "plaud_user_id": plaud_user_id,
        "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_EXPIRY_DAYS),
    }
    return jwt.encode(payload, SESSION_SECRET, algorithm="HS256")

def verify_session_token(token: str) -> dict | None:
    """Verify and decode session JWT. Returns payload or None."""
    try:
        return jwt.decode(token, SESSION_SECRET, algorithms=["HS256"])
    except jwt.InvalidTokenError:
        return None
```

#### `backend/middleware/auth.py` — Request authentication

```python
"""FastAPI middleware/dependency to extract current user from session cookie."""

from fastapi import Request, HTTPException, Depends
from services.auth import verify_session_token
from services.supabase import get_supabase

async def get_current_user(request: Request) -> dict:
    """Extract and validate user from session cookie.

    Returns user dict with at minimum: { id, plaud_user_id }
    Raises 401 if not authenticated.
    """
    token = request.cookies.get("session")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = verify_session_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return {"id": payload["user_id"], "plaud_user_id": payload["plaud_user_id"]}

async def get_optional_user(request: Request) -> dict | None:
    """Same as get_current_user but returns None instead of 401.

    Use for endpoints that work with or without auth (backwards compat).
    """
    token = request.cookies.get("session")
    if not token:
        return None
    payload = verify_session_token(token)
    return {"id": payload["user_id"], "plaud_user_id": payload["plaud_user_id"]} if payload else None
```

#### `backend/routers/auth.py` — Login/callback/logout endpoints

```python
router = APIRouter()

@router.get("/auth/login")
def login(redirect_uri: str):
    """Return PLAUD OAuth URL for frontend to redirect to."""
    oauth_url = get_oauth_url(redirect_uri)
    return {"oauth_url": oauth_url}

@router.post("/auth/callback")
async def callback(req: CallbackRequest):
    """Exchange code, fetch user, upsert DB, return session cookie."""
    tokens = await exchange_code(req.code, req.redirect_uri)
    plaud_user = await get_plaud_user(tokens["access_token"])

    # Upsert user in Supabase
    db = get_supabase()
    user = upsert_user(db, plaud_user, tokens)

    # Issue session JWT
    session_token = create_session_token(user["id"], user["plaud_user_id"])

    response = JSONResponse({"success": True, "user": {...}})
    response.set_cookie("session", session_token, httponly=True, samesite="lax", max_age=7*86400)
    return response

@router.post("/auth/logout")
def logout():
    response = JSONResponse({"success": True})
    response.delete_cookie("session")
    return response

@router.get("/auth/me")
def me(user = Depends(get_current_user)):
    """Return current user profile."""
    return user
```

### Modified Files

#### `backend/main.py`
- Add `from routers import auth`
- `app.include_router(auth.router, prefix="/api")`

#### `backend/routers/integrations.py`
- Replace hardcoded `USER_ID = "demo_user"` with user from auth middleware
- Use `user.id` as Composio entity ID (each user = unique entity)
- Store integration state in `user_integrations` table instead of in-memory

#### `backend/routers/events.py`
- Add `user = Depends(get_current_user)` to all endpoints
- Filter queries by `user_id`

#### `backend/services/sync.py`
- Accept `user_id` parameter
- Pass `user_id` to adapters (for Composio entity isolation)
- Tag all upserted events with `user_id`

#### `backend/adapters/salesforce.py` + `google_calendar.py`
- Accept `user_id` / Composio entity ID instead of hardcoded `"demo_user"`

#### `backend/routers/files.py`
- Fetch real files from PLAUD API using stored `plaud_access_token`
- Fallback to mock data if no auth

### PLAUD Files Integration

The PLAUD API provides real recording files:

```python
async def fetch_plaud_files(access_token: str) -> list[dict]:
    """Fetch user's recording files from PLAUD platform."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{PLAUD_BASE}/api/open/third-party/files/",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        resp.raise_for_status()
        return resp.json()
```

This replaces the current mock data in `/files` endpoint with real user recordings.

---

## Frontend Changes

### New Files

#### `frontend/lib/auth.ts` — Auth context + hooks

```typescript
"use client";
import { createContext, useContext, useEffect, useState } from "react";

interface User {
  id: string;
  plaud_user_id: string;
  name: string;
  avatar_url?: string;
}

interface AuthContext {
  user: User | null;
  loading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

// Check auth on app mount via GET /api/auth/me
// If 401 → redirect to login
// Session stored in HttpOnly cookie (auto-sent by browser)
```

#### `frontend/app/login/page.tsx` — Login page

- "Login with PLAUD" button
- On click: `GET /api/auth/login?redirect_uri=.../auth/callback` → redirect to PLAUD OAuth
- Nika designs the authorization UI on PLAUD side

#### `frontend/app/auth/callback/page.tsx` — OAuth callback handler

- Reads `?code=xxx` from URL
- `POST /api/auth/callback { code, redirect_uri }`
- On success → redirect to `/sales`

### Modified Files

#### `frontend/lib/api.ts`

- Add `credentials: "include"` to all fetch calls (sends cookies)
- Add auth API methods: `login()`, `callback()`, `logout()`, `getMe()`

```typescript
async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",  // <-- send session cookie
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Not authenticated");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

#### `frontend/app/layout.tsx` or route group layouts

- Wrap with `AuthProvider`
- `(main)` and `(detail)` layouts require auth
- `/login` and `/auth/callback` are public

---

## Environment Variables

### Backend

```env
# PLAUD OAuth (required for auth)
PLAUD_CLIENT_ID=client_cf5b6c7d-e717-4522-87bf-6d9ed46009b8
PLAUD_CLIENT_SECRET=sk_g8JDZe3oGDxk_vbg4OYm4WloHv1PH8M8fldiGtq8MW0

# Session JWT signing secret (generate a random 32+ char string for production)
SESSION_SECRET=your-random-secret-here

# Existing
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
COMPOSIO_API_KEY=...
```

### Frontend

```env
# No new vars needed — auth is cookie-based
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Implementation Order

### Phase 1: Auth foundation (Day 1)

1. **Migration**: Create `users` + `user_integrations` tables, add `user_id` columns
2. **`services/auth.py`**: PLAUD OAuth client + JWT session
3. **`middleware/auth.py`**: Auth dependency
4. **`routers/auth.py`**: Login/callback/logout/me endpoints
5. **Frontend**: `AuthProvider`, login page, callback page
6. **Frontend**: Add `credentials: "include"` to `api.ts`

### Phase 2: Multi-user data isolation (Day 2)

7. **Backend**: Update all routers to use `get_current_user` dependency
8. **Backend**: Pass `user_id` through sync pipeline → adapters
9. **Backend**: Store Composio entity as `user.id` instead of `"demo_user"`
10. **Backend**: Integration state in `user_integrations` table

### Phase 3: Real PLAUD files (Day 2-3)

11. **Backend**: `files.py` → fetch from PLAUD API with user's access_token
12. **Backend**: Token refresh logic (when access_token expires)
13. **Frontend**: Remove mock file data, use real API

### Phase 4: Cleanup (Day 3)

14. Remove hardcoded `demo_user` references
15. Remove mock data files that are no longer needed
16. Add `get_optional_user` to endpoints that should work without auth (health, etc.)
17. Test full flow: PLAUD login → see real files → connect Salesforce → see events

---

## Backwards Compatibility

During development, support both modes:

- **No `PLAUD_CLIENT_ID` set**: Skip auth middleware, use `demo_user` (current behavior)
- **With `PLAUD_CLIENT_ID` set**: Require auth, real multi-user mode

This lets local dev work without PLAUD credentials while production uses real auth.

---

## Security Considerations

1. **Client secret stays backend-only** — never sent to frontend
2. **PLAUD tokens encrypted at rest** in Supabase (use `pgcrypto` or app-level encryption)
3. **HttpOnly cookies** prevent XSS token theft
4. **CORS**: Tighten `allow_origins` from `["*"]` to specific frontend domain in production
5. **CSRF**: SameSite=Lax cookie + verify Origin header for state-changing requests

---

## Open Questions

1. **PLAUD user ID field name**: What does `/users/current` actually return? Need to know the exact response shape (field name for user ID, display name, avatar, etc.)
2. **Authorization page design**: Nika is providing this — we need the redirect_uri format and any required scopes
3. **Token expiry**: How long do PLAUD access tokens last? This determines refresh strategy
4. **File API response shape**: What does `/open/third-party/files/` return? Need to map to our `RecordingFile` type
5. **Composio multi-user**: Currently one Composio project = one webhook URL. Each user connecting Salesforce creates a new `connected_account` under their entity ID. Verify this works with Composio's entity model
