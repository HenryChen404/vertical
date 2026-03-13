from __future__ import annotations

import os
import logging
from datetime import datetime

from adapters.base import BaseAdapter, NormalizedEvent

logger = logging.getLogger(__name__)

USER_ID = "demo_user"


class SalesforceAdapter(BaseAdapter):
    def __init__(self):
        self.api_key = os.getenv("COMPOSIO_API_KEY")

    async def fetch_events(self, time_min: datetime, time_max: datetime) -> list[NormalizedEvent]:
        if not self.api_key:
            logger.info("No COMPOSIO_API_KEY, skipping Salesforce fetch")
            return []

        from composio import Composio

        client = Composio(api_key=self.api_key)

        # Find active Salesforce connection
        result = client.connected_accounts.list(
            user_ids=[USER_ID],
            toolkit_slugs=["salesforce"],
            statuses=["ACTIVE"],
        )
        if not result.items:
            logger.info("No active Salesforce connection")
            return []

        connected_account = result.items[0]

        # Query Salesforce Events via SOQL
        time_min_str = time_min.strftime("%Y-%m-%dT%H:%M:%SZ")
        time_max_str = time_max.strftime("%Y-%m-%dT%H:%M:%SZ")

        soql = (
            "SELECT Id, Subject, StartDateTime, EndDateTime, Location, Description, "
            "Who.Name, Who.Email, What.Name, What.Type, "
            "OwnerId, Owner.Name, Owner.Email "
            f"FROM Event "
            f"WHERE StartDateTime >= {time_min_str} "
            f"AND StartDateTime <= {time_max_str} "
            "ORDER BY StartDateTime ASC "
            "LIMIT 100"
        )

        try:
            resp = client.tools.execute(
                slug="SALESFORCE_EXECUTE_SOQL_QUERY",
                arguments={"soql_query": soql},
                connected_account_id=connected_account.id,
                user_id=USER_ID,
                dangerously_skip_version_check=True,
            )
        except Exception as e:
            logger.error("Salesforce SOQL query failed: %s", e)
            # Fallback: try simpler query without relationship fields
            return await self._fetch_simple(client, connected_account, time_min_str, time_max_str)

        data = resp.model_dump() if hasattr(resp, "model_dump") else resp
        raw_data = data.get("data", data) if isinstance(data, dict) else {}
        records = raw_data.get("records", raw_data.get("items", []))

        events = []
        for record in records:
            try:
                events.append(self._normalize(record))
            except Exception as e:
                logger.warning("Failed to normalize Salesforce event %s: %s", record.get("Id"), e)

        logger.info("Fetched %d events from Salesforce", len(events))
        return events

    async def _fetch_simple(
        self, client, connected_account, time_min_str: str, time_max_str: str
    ) -> list[NormalizedEvent]:
        """Fallback: simpler SOQL without relationship fields."""
        soql = (
            "SELECT Id, Subject, StartDateTime, EndDateTime, Location, Description "
            f"FROM Event "
            f"WHERE StartDateTime >= {time_min_str} "
            f"AND StartDateTime <= {time_max_str} "
            "ORDER BY StartDateTime ASC "
            "LIMIT 100"
        )
        try:
            resp = client.tools.execute(
                slug="SALESFORCE_EXECUTE_SOQL_QUERY",
                arguments={"soql_query": soql},
                connected_account_id=connected_account.id,
                user_id=USER_ID,
                dangerously_skip_version_check=True,
            )
        except Exception as e:
            logger.error("Salesforce simple query also failed: %s", e)
            return []

        data = resp.model_dump() if hasattr(resp, "model_dump") else resp
        raw_data = data.get("data", data) if isinstance(data, dict) else {}
        records = raw_data.get("records", raw_data.get("items", []))

        events = []
        for record in records:
            try:
                events.append(self._normalize(record))
            except Exception as e:
                logger.warning("Failed to normalize Salesforce event %s: %s", record.get("Id"), e)

        logger.info("Fetched %d events from Salesforce (simple query)", len(events))
        return events

    def _normalize(self, record: dict) -> NormalizedEvent:
        start_time = datetime.fromisoformat(record["StartDateTime"])
        end_time = datetime.fromisoformat(record["EndDateTime"])

        attendees = []

        # Owner as organizer
        owner = record.get("Owner") or {}
        owner_email = owner.get("Email")
        if owner_email:
            attendees.append({
                "email": owner_email,
                "name": owner.get("Name", owner_email),
                "role": "organizer",
            })

        # Who (contact/lead)
        who = record.get("Who") or {}
        who_email = who.get("Email")
        if who_email:
            attendees.append({
                "email": who_email,
                "name": who.get("Name", who_email),
                "role": "attendee",
            })

        # Related deal/opportunity
        what = record.get("What") or {}
        related_deal = None
        if what.get("Type") in ("Opportunity", "Deal"):
            related_deal = what.get("Name")

        return NormalizedEvent(
            source="salesforce",
            source_id=record["Id"],
            title=record.get("Subject", "Untitled"),
            start_time=start_time,
            end_time=end_time,
            attendees=attendees,
            description=record.get("Description"),
            location=record.get("Location"),
            related_deal=related_deal,
            raw_data=record,
        )
