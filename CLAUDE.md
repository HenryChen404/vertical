# Vertical — PLAUD Sales AI Assistant (Demo MVP)

## What is this

Mobile-first sales AI assistant demo. 12 screens: Files, Sales Workbench, CRM/Calendar Onboarding, Deal Detail, Schedule Detail, Live Recording (SSE transcript), and a full Update CRM flow (Select → Review Chat → Edit → Processing → Success). All data is **mock/hardcoded** — no database, no auth, no persistence. Designed to be viewed in a browser with a phone-frame wrapper.

## Project Structure

```
frontend/    — Next.js 16 + React 19 + Tailwind v4 + shadcn/ui
backend/     — FastAPI + Pydantic v2 (mock data only)
pencil/      — Design file (vertical_mvp.pen, read via Pencil MCP tools only)
```

## Running

```bash
# Frontend (port 3000)
cd frontend && npm run dev

# Backend (port 8000)
cd backend && uv run uvicorn main:app --reload

# Build check
cd frontend && npm run build
```

## Frontend

- **Framework**: Next.js 16.1.6 App Router, React 19, TypeScript
- **Styling**: Tailwind CSS v4 with CSS custom properties in `globals.css`
- **Components**: shadcn/ui (New York style), Lucide icons
- **Route groups**: `(main)/` has BottomTabBar, `(detail)/` has back-button header
- **Phone frame**: 402px centered wrapper on desktop, full-width on mobile (`components/layout/phone-frame.tsx`)
- **API client**: `lib/api.ts` — all fetch calls to backend, base URL from `NEXT_PUBLIC_API_URL` env var
- **Types**: `lib/types.ts` — all shared TypeScript interfaces
- **Inter-page state**: `sessionStorage` (CRM update flow only)
- **Note**: `@supabase/*` deps in package.json are unused leftovers — ignore them

### Routes

| Route | Screen |
|-------|--------|
| `/` | Redirects to `/sales` |
| `/files` | Recording files list |
| `/sales` | Today/Tomorrow schedule |
| `/sales/onboarding/crm` | Connect CRM |
| `/sales/onboarding/calendar` | Connect Calendar |
| `/deals/[id]` | Deal detail |
| `/schedule/[id]` | Meeting detail |
| `/schedule/[id]/recording` | Live recording + SSE transcript |
| `/update-crm` | Select unsynced recordings |
| `/update-crm/review` | AI chat proposing CRM changes |
| `/update-crm/edit` | Editable change table |
| `/update-crm/processing` | Progress animation |
| `/update-crm/success` | Completion summary |

## Backend

- **Framework**: FastAPI, Python ≥3.11, managed with `uv`
- **All data is mock**: hardcoded in `mock_data/*.py`, returned directly from endpoints
- **No database, no auth, no external services**
- **SSE streaming**: `GET /api/schedule/{id}/recording/stream` streams mock transcript lines with 2s delay
- **In-memory state**: `integrations.py` CRM/Calendar connection status resets on restart

### API Endpoints

All prefixed with `/api`:
- `GET /files` — recording files list
- `GET /sales/schedule` — today/tomorrow meetings
- `GET /deals/{id}` — deal detail
- `GET /schedule/{id}` — meeting detail
- `POST /schedule/{id}/recording/start|stop` — recording control
- `GET /schedule/{id}/recording/stream` — SSE transcript stream
- `GET /crm-update/recordings` — unsynced recordings
- `POST /crm-update/analyze` — returns mock CRM change proposal
- `POST /crm-update/confirm` — confirm one section
- `POST /crm-update/confirm-all` — confirm all
- `PUT /crm-update/changes` — save edits
- `POST /crm-update/apply` — apply to CRM
- `GET /crm-update/status` — progress poll
- `GET /integrations/crm/status` — CRM connection status
- `POST /integrations/crm/connect` — connect CRM
- `GET /integrations/calendar/status` — calendar status
- `POST /integrations/calendar/connect` — connect calendar

## Design

- Design source: `pencil/vertical_mvp.pen` — **must use Pencil MCP tools** to read, never Read/Grep
- Color theme defined in `frontend/app/globals.css` CSS custom properties
- Key colors: bg #F9F9F9, card #FFFFFF, accent-blue #1A89FF, green #22C55E, red #FB2C36
