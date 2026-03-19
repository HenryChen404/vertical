"""Data models for the sales analyst skill."""

from __future__ import annotations

from pydantic import BaseModel


class FieldDiff(BaseModel):
    """A single field-level change."""

    field: str  # Salesforce API field name (e.g. "StageName")
    label: str  # Human-readable label (e.g. "Stage")
    old: str | None = None  # Current value (None for create actions)
    new: str  # Proposed new value


class ProposedChange(BaseModel):
    """A proposed CRM change — update an existing record or create a new one."""

    id: str  # Unique ID (e.g. "chg_1")
    object_type: str  # Salesforce object (e.g. "Opportunity", "Task", "Event")
    object_name: str | None = None  # Display name (e.g. "Acme Deal")
    record_id: str | None = None  # Salesforce record ID (None for create)
    action: str  # "update" or "create"
    changes: list[FieldDiff]
    approved: bool = True


class AnalysisResult(BaseModel):
    """Output of the sales analyst agent."""

    proposed_changes: list[ProposedChange]
    summary: str  # Brief text explaining what was found
