from __future__ import annotations

import os
import logging
from datetime import datetime

from adapters.base import BaseAdapter, NormalizedEvent

logger = logging.getLogger(__name__)

class GoogleCalendarAdapter(BaseAdapter):
    def __init__(self):
        self.api_key = os.getenv("COMPOSIO_API_KEY")

    async def fetch_events(self, time_min: datetime, time_max: datetime, user_id: str = "demo_user") -> list[NormalizedEvent]:
        if not self.api_key:
            logger.info("No COMPOSIO_API_KEY, skipping Google Calendar fetch")
            return []

        from composio import Composio

        client = Composio(api_key=self.api_key)

        # Find active Google Calendar connection
        result = client.connected_accounts.list(
            user_ids=[user_id],
            toolkit_slugs=["googlecalendar"],
            statuses=["ACTIVE"],
        )
        if not result.items:
            logger.info("No active Google Calendar connection")
            return []

        connected_account = result.items[0]

        try:
            resp = client.tools.execute(
                slug="GOOGLECALENDAR_EVENTS_LIST",
                arguments={
                    "calendarId": "primary",
                    "timeMin": time_min.isoformat(),
                    "timeMax": time_max.isoformat(),
                    "singleEvents": True,
                    "orderBy": "startTime",
                    "maxResults": 100,
                },
                connected_account_id=connected_account.id,
                user_id=user_id,
                dangerously_skip_version_check=True,
            )
        except Exception as e:
            logger.error("Google Calendar fetch failed: %s", e)
            return []

        # Extract items from response
        data = resp.model_dump() if hasattr(resp, "model_dump") else resp
        raw_data = data.get("data", data) if isinstance(data, dict) else {}
        raw_items = raw_data.get("items", [])

        events = []
        for item in raw_items:
            try:
                events.append(self._normalize(item))
            except Exception as e:
                logger.warning("Failed to normalize event %s: %s", item.get("id"), e)

        logger.info("Fetched %d events from Google Calendar", len(events))
        return events

    def _normalize(self, item: dict) -> NormalizedEvent:
        start = item.get("start", {})
        end = item.get("end", {})

        start_time = self._parse_time(start)
        end_time = self._parse_time(end)

        attendees = []
        for a in item.get("attendees", []):
            attendees.append({
                "email": a.get("email", ""),
                "name": a.get("displayName", a.get("email", "")),
                "role": "organizer" if a.get("organizer") else "attendee",
            })

        # Add organizer if not in attendees list
        organizer = item.get("organizer", {})
        organizer_email = organizer.get("email", "")
        if organizer_email and not any(a["email"] == organizer_email for a in attendees):
            attendees.insert(0, {
                "email": organizer_email,
                "name": organizer.get("displayName", organizer_email),
                "role": "organizer",
            })

        return NormalizedEvent(
            source="google_calendar",
            source_id=item["id"],
            title=item.get("summary", "Untitled"),
            start_time=start_time,
            end_time=end_time,
            attendees=attendees,
            description=item.get("description"),
            location=item.get("location"),
            raw_data=item,
        )

    @staticmethod
    def _parse_time(time_obj: dict) -> datetime:
        if "dateTime" in time_obj:
            return datetime.fromisoformat(time_obj["dateTime"])
        if "date" in time_obj:
            return datetime.fromisoformat(time_obj["date"])
        raise ValueError(f"Cannot parse time: {time_obj}")
