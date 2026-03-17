from __future__ import annotations

import os
import logging
from datetime import datetime

from adapters.base import BaseAdapter, NormalizedEvent

logger = logging.getLogger(__name__)

class SalesforceAdapter(BaseAdapter):
    def __init__(self):
        self.api_key = os.getenv("COMPOSIO_API_KEY")
        self._current_user_id = "demo_user"

    def _get_client_and_account(self, user_id: str | None = None):
        """Return (Composio client, connected_account) or (None, None)."""
        uid = user_id or self._current_user_id
        if not self.api_key:
            logger.info("SalesforceAdapter: no COMPOSIO_API_KEY")
            return None, None
        from composio import Composio
        client = Composio(api_key=self.api_key)
        result = client.connected_accounts.list(
            user_ids=[uid],
            toolkit_slugs=["salesforce"],
            statuses=["ACTIVE"],
        )
        logger.info("SalesforceAdapter: found %d active connections", len(result.items))
        if not result.items:
            return client, None
        return client, result.items[0]

    def _execute_soql(self, client, connected_account, soql: str, user_id: str | None = None) -> dict | None:
        """Execute a SOQL query and return parsed data, or None on failure."""
        uid = user_id or self._current_user_id
        try:
            resp = client.tools.execute(
                slug="SALESFORCE_EXECUTE_SOQL_QUERY",
                arguments={"soql_query": soql},
                connected_account_id=connected_account.id,
                user_id=uid,
                dangerously_skip_version_check=True,
            )
            data = resp.model_dump() if hasattr(resp, "model_dump") else resp
            if isinstance(data, dict) and data.get("successful") is False:
                logger.warning("SOQL query failed: %s", data.get("error"))
                return None
            return data.get("data", data) if isinstance(data, dict) else {}
        except Exception as e:
            logger.error("SOQL execution error: %s", e)
            return None

    async def fetch_events(self, time_min: datetime, time_max: datetime, user_id: str = "demo_user") -> list[NormalizedEvent]:
        self._current_user_id = user_id
        if not self.api_key:
            logger.info("No COMPOSIO_API_KEY, skipping Salesforce fetch")
            return []

        client, connected_account = self._get_client_and_account(user_id)
        if not connected_account:
            logger.info("No active Salesforce connection")
            return []

        time_min_str = time_min.strftime("%Y-%m-%dT%H:%M:%SZ")
        time_max_str = time_max.strftime("%Y-%m-%dT%H:%M:%SZ")

        soql = (
            "SELECT Id, Subject, StartDateTime, EndDateTime, Location, Description, "
            "WhoId, WhatId, Who.Name, Who.Email, What.Name, What.Type, "
            "OwnerId, Owner.Name, Owner.Email "
            f"FROM Event "
            f"WHERE StartDateTime >= {time_min_str} "
            f"AND StartDateTime <= {time_max_str} "
            "ORDER BY StartDateTime ASC "
            "LIMIT 100"
        )

        logger.info("SalesforceAdapter SOQL: %s", soql)
        raw_data = self._execute_soql(client, connected_account, soql)
        if raw_data is None:
            logger.warning("SalesforceAdapter: main SOQL returned None, trying simple query")
            return await self._fetch_simple(client, connected_account, time_min_str, time_max_str)

        records = raw_data.get("records", raw_data.get("items", []))
        logger.info("SalesforceAdapter: SOQL returned %d records", len(records))

        # Fetch related entities in bulk
        related = self._fetch_related_entities(client, connected_account, records)

        events = []
        for record in records:
            try:
                event = self._normalize(record)
                event_id = record.get("Id", "")
                if event_id in related:
                    event.sales_details = related[event_id]
                events.append(event)
            except Exception as e:
                logger.warning("Failed to normalize Salesforce event %s: %s", record.get("Id"), e)

        logger.info("Fetched %d events from Salesforce", len(events))
        return events

    def _fetch_related_entities(
        self, client, connected_account, records: list[dict]
    ) -> dict[str, dict]:
        """Fetch Account, Opportunity, and Participant data for events.

        Returns a dict mapping Salesforce Event Id -> sales_details dict.
        """
        result: dict[str, dict] = {}

        # Collect WhatIds that are Opportunities
        opp_ids: set[str] = set()
        event_ids: list[str] = []
        event_what_map: dict[str, str] = {}  # event_id -> what_id
        event_what_type: dict[str, str] = {}  # event_id -> what_type

        for record in records:
            eid = record.get("Id", "")
            event_ids.append(eid)
            what_id = record.get("WhatId")
            what = record.get("What") or {}
            what_type = what.get("Type", "")
            if what_id:
                event_what_map[eid] = what_id
                event_what_type[eid] = what_type
                if what_type == "Opportunity":
                    opp_ids.add(what_id)

        # Batch fetch Opportunities with Account info
        opp_data: dict[str, dict] = {}  # opp_id -> {opportunity, account}
        if opp_ids:
            ids_str = ",".join(f"'{oid}'" for oid in opp_ids)
            soql = (
                "SELECT Id, Name, Amount, StageName, CloseDate, AccountId, "
                "Account.Name, Account.AnnualRevenue, Account.Industry "
                f"FROM Opportunity WHERE Id IN ({ids_str})"
            )
            raw = self._execute_soql(client, connected_account, soql)
            if raw:
                for rec in raw.get("records", []):
                    acct = rec.get("Account") or {}
                    opp_data[rec["Id"]] = {
                        "opportunity": {
                            "id": rec["Id"],
                            "name": rec.get("Name", ""),
                            "amount": rec.get("Amount"),
                            "stage": rec.get("StageName", ""),
                            "close_date": rec.get("CloseDate"),
                        },
                        "account": {
                            "id": rec.get("AccountId"),
                            "name": acct.get("Name", ""),
                            "annual_revenue": acct.get("AnnualRevenue"),
                            "industry": acct.get("Industry"),
                        },
                    }

        # For events where WhatId is an Account (not Opportunity), fetch Account directly
        account_ids: set[str] = set()
        for eid, wtype in event_what_type.items():
            if wtype == "Account":
                account_ids.add(event_what_map[eid])
        account_data: dict[str, dict] = {}
        if account_ids:
            ids_str = ",".join(f"'{aid}'" for aid in account_ids)
            soql = (
                "SELECT Id, Name, AnnualRevenue, Industry "
                f"FROM Account WHERE Id IN ({ids_str})"
            )
            raw = self._execute_soql(client, connected_account, soql)
            if raw:
                for rec in raw.get("records", []):
                    account_data[rec["Id"]] = {
                        "id": rec["Id"],
                        "name": rec.get("Name", ""),
                        "annual_revenue": rec.get("AnnualRevenue"),
                        "industry": rec.get("Industry"),
                    }

        # Batch fetch EventRelation (participants)
        participants_map: dict[str, list[dict]] = {}  # event_id -> [participant]
        if event_ids:
            ids_str = ",".join(f"'{eid}'" for eid in event_ids)
            soql = (
                "SELECT EventId, RelationId, Status, Relation.Name, Relation.Email "
                f"FROM EventRelation WHERE EventId IN ({ids_str})"
            )
            raw = self._execute_soql(client, connected_account, soql)
            if raw:
                for rec in raw.get("records", []):
                    eid = rec.get("EventId", "")
                    relation = rec.get("Relation") or {}
                    p = {
                        "id": rec.get("RelationId", ""),
                        "name": relation.get("Name", ""),
                        "email": relation.get("Email", ""),
                        "status": rec.get("Status", ""),
                    }
                    participants_map.setdefault(eid, []).append(p)

        # Assemble sales_details for each event
        for record in records:
            eid = record.get("Id", "")
            details: dict = {}
            what_id = event_what_map.get(eid)
            what_type = event_what_type.get(eid)

            if what_type == "Opportunity" and what_id in opp_data:
                details["account"] = opp_data[what_id]["account"]
                details["opportunity"] = opp_data[what_id]["opportunity"]
            elif what_type == "Account" and what_id in account_data:
                details["account"] = account_data[what_id]

            if eid in participants_map:
                details["participants"] = participants_map[eid]

            if details:
                result[eid] = details

        return result

    def fetch_related_for_event(self, client, connected_account, event_record: dict) -> dict | None:
        """Fetch related entities for a single event. Used by webhook handler."""
        related = self._fetch_related_entities(client, connected_account, [event_record])
        return related.get(event_record.get("Id", ""))

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
        raw_data = self._execute_soql(client, connected_account, soql)
        if raw_data is None:
            return []

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
