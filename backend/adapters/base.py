from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from pydantic import BaseModel


class NormalizedEvent(BaseModel):
    source: str  # "google_calendar" | "outlook_calendar" | "salesforce"
    source_id: str
    title: str
    start_time: datetime
    end_time: datetime
    attendees: list[dict]  # [{email, name, role?}]
    description: str | None = None
    location: str | None = None
    related_deal: str | None = None
    raw_data: dict = {}
    sales_details: dict | None = None


class BaseAdapter(ABC):
    @abstractmethod
    async def fetch_events(self, time_min: datetime, time_max: datetime) -> list[NormalizedEvent]:
        """Fetch and normalize events from the source within the time range."""
        ...
