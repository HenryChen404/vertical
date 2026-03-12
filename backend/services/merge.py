from __future__ import annotations

import hashlib
import logging
from datetime import datetime

from adapters.base import NormalizedEvent

logger = logging.getLogger(__name__)


def compute_merge_key(event: NormalizedEvent) -> str:
    """Generate a merge key for deduplication.

    Strategy:
    1. Same source + source_id → identical event (trivial)
    2. Cross-source: time overlap > 80% AND shared attendees ≥ 1 → merge
    3. Same title + same day → merge

    For the merge key, we use: date + normalized_title + sorted_attendee_emails
    This lets us detect duplicates across sources.
    """
    date_str = event.start_time.strftime("%Y-%m-%d")
    title_norm = _normalize_title(event.title)
    emails = sorted(a.get("email", "").lower() for a in event.attendees if a.get("email"))
    emails_str = ",".join(emails[:5])  # cap to avoid overly long keys

    raw = f"{date_str}|{title_norm}|{emails_str}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def should_merge(existing_key: str, new_event: NormalizedEvent) -> bool:
    """Check if a new event should be merged with an existing one by key."""
    return compute_merge_key(new_event) == existing_key


def find_merge_candidate(
    new_event: NormalizedEvent,
    existing_events: list[dict],
) -> dict | None:
    """Find an existing merged_event that the new event should merge into.

    Rules (checked in order):
    1. Time overlap > 80% AND at least 1 shared attendee email
    2. Same normalized title on the same day
    """
    new_emails = {a.get("email", "").lower() for a in new_event.attendees if a.get("email")}
    new_title = _normalize_title(new_event.title)
    new_date = new_event.start_time.date()

    for existing in existing_events:
        # Rule 1: time overlap + shared attendees
        ex_start = _parse_dt(existing["start_time"])
        ex_end = _parse_dt(existing["end_time"])
        overlap = _time_overlap_pct(new_event.start_time, new_event.end_time, ex_start, ex_end)

        if overlap > 0.8:
            ex_emails = {
                a.get("email", "").lower()
                for a in (existing.get("attendees") or [])
                if a.get("email")
            }
            if new_emails & ex_emails:
                return existing

        # Rule 2: same title + same day
        ex_title = _normalize_title(existing["title"])
        ex_date = ex_start.date()
        if new_title == ex_title and new_date == ex_date:
            return existing

    return None


def merge_attendees(existing: list[dict], new: list[dict]) -> list[dict]:
    """Merge attendee lists, deduplicating by email."""
    seen = {}
    for a in existing + new:
        email = a.get("email", "").lower()
        if email and email not in seen:
            seen[email] = a
    return list(seen.values())


def _normalize_title(title: str) -> str:
    """Lowercase, strip whitespace and common prefixes for comparison."""
    t = title.lower().strip()
    for prefix in ("re:", "fwd:", "meeting:", "call:"):
        if t.startswith(prefix):
            t = t[len(prefix):].strip()
    return t


def _time_overlap_pct(s1: datetime, e1: datetime, s2: datetime, e2: datetime) -> float:
    """Calculate what fraction of the shorter event overlaps with the longer one."""
    overlap_start = max(s1, s2)
    overlap_end = min(e1, e2)
    overlap = max(0, (overlap_end - overlap_start).total_seconds())

    dur1 = max(1, (e1 - s1).total_seconds())
    dur2 = max(1, (e2 - s2).total_seconds())
    shorter = min(dur1, dur2)

    return overlap / shorter


def _parse_dt(val) -> datetime:
    if isinstance(val, datetime):
        return val
    return datetime.fromisoformat(str(val))
