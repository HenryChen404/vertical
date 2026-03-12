from pydantic import BaseModel
from typing import Optional


class RecordingFile(BaseModel):
    id: str
    title: str
    timestamp: str
    duration_seconds: int


class CrmTag(BaseModel):
    label: str
    type: str  # "account" | "opportunity" | "contact"


class ScheduleMeeting(BaseModel):
    id: str
    time_start: str
    time_end: str
    title: str
    crm_tags: list[CrmTag]
    date_group: str
    feedback_label: Optional[str] = None


class ScheduleResponse(BaseModel):
    today: list[ScheduleMeeting]
    tomorrow: list[ScheduleMeeting]


class Person(BaseModel):
    id: str
    name: str
    title: str
    avatar_url: Optional[str] = None


class DealMeeting(BaseModel):
    id: str
    title: str
    date: str


class DealRecording(BaseModel):
    id: str
    title: str
    date: str
    duration: str


class Deal(BaseModel):
    id: str
    name: str
    org_name: str
    sector: str
    amount: str
    stage: str
    close_date: str
    persons: list[Person]
    meetings: list[DealMeeting]
    recordings: list[DealRecording]


class AccountInfo(BaseModel):
    name: str
    sector: str
    deal_id: Optional[str] = None


class OpportunityInfo(BaseModel):
    name: str
    amount: str
    stage: str


class Attendee(BaseModel):
    id: str
    name: str
    title: str
    company: str
    avatar_url: Optional[str] = None


class LinkedFile(BaseModel):
    id: str
    title: str
    duration: str


class MeetingDetail(BaseModel):
    id: str
    title: str
    date: str
    time_start: str
    time_end: str
    location: str
    account: AccountInfo
    opportunity: OpportunityInfo
    attendees: list[Attendee]
    feedback: str
    linked_files: list[LinkedFile]


class UnsyncedRecording(BaseModel):
    id: str
    title: str
    date: str
    duration: str
    selected: bool


class FieldChange(BaseModel):
    field: str
    old_value: str
    new_value: str


class CrmChangeSection(BaseModel):
    category: str
    fields: list[FieldChange]
    confirmed: bool = False


class CrmChangeProposal(BaseModel):
    session_id: str
    recording_title: str
    sections: list[CrmChangeSection]


class CrmUpdateProgress(BaseModel):
    total: int
    completed: int
    current_item: str
    status: str  # "processing" | "done"


class IntegrationStatus(BaseModel):
    connected: bool
    provider: Optional[str] = None


class ConnectionInitResponse(BaseModel):
    redirect_url: Optional[str] = None
    connected_account_id: Optional[str] = None
    success: Optional[bool] = None
