export interface RecordingFile {
  id: string;
  title: string;
  timestamp?: string;
  recorded_at?: string;
  duration_seconds: number;
  source_type?: number; // 1=plaud, 2=local
  plaud_file_id?: string;
  event_id?: string | null;
  crm_sync_status?: number; // 1=not synced, 2=synced
}

export interface CrmTag {
  label: string;
  type: "account" | "opportunity" | "contact";
}

export interface ScheduleMeeting {
  id: string;
  time_start: string;
  time_end: string;
  title: string;
  crm_tags: CrmTag[];
  date_group: string;
  feedback_label?: string;
}

export interface Person {
  id: string;
  name: string;
  title: string;
  avatar_url?: string;
}

export interface DealContact {
  id: string;
  name: string;
  email?: string;
  title?: string;
  company?: string;
}

export interface DealAccount {
  id?: string;
  name: string;
  revenue?: number | null;
  industry?: string | null;
}

export interface DealListItem {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  close_date: string | null;
  account: DealAccount;
}

export interface Deal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
  close_date: string | null;
  account: DealAccount;
  contacts: DealContact[];
  meetings: { id: string; title: string; start_time: string; end_time?: string; subtitle?: string }[];
  recordings: { id: string; title: string; recorded_at?: string; duration_seconds: number }[];
}

export interface Attendee {
  id: string;
  name: string;
  title?: string;
  company?: string;
  avatar_url?: string;
  status?: string;
}

export interface SalesDetails {
  account?: {
    id?: string;
    name: string;
    annual_revenue?: number | null;
    industry?: string | null;
  };
  opportunity?: {
    id?: string;
    name: string;
    amount?: number | null;
    stage?: string;
    close_date?: string | null;
  };
  participants?: {
    id?: string;
    name: string;
    email?: string;
    status?: string;
  }[];
}

export interface MeetingDetail {
  id: string;
  title: string;
  date: string;
  time_start: string;
  time_end: string;
  location: string;
  account?: { name: string; sector: string; annual_revenue?: string; deal_id?: string } | null;
  opportunity?: { id?: string; name: string; amount: string; stage: string; close_date?: string } | null;
  attendees: Attendee[];
  feedback: string;
  linked_files: { id: string; title: string; duration_seconds: number; recorded_at?: string; plaud_file_id?: string }[];
}

export interface FieldChange {
  field: string;
  old_value: string;
  new_value: string;
}

export interface CrmChangeSection {
  category: string;
  name?: string;
  fields: FieldChange[];
  confirmed: boolean;
}

export interface CrmChangeProposal {
  session_id: string;
  recording_title: string;
  sections: CrmChangeSection[];
}

export interface CrmUpdateProgress {
  total: number;
  completed: number;
  current_item: string;
  status: "processing" | "done";
}

export interface EventSource {
  source: "google_calendar" | "outlook_calendar" | "salesforce";
  source_id: string;
}

export interface EventAttendee {
  email: string;
  name: string;
  role?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  location: string | null;
  description: string | null;
  attendees: EventAttendee[];
  related_deal: string | null;
  merge_key: string;
  created_at: string;
  updated_at: string;
  event_sources: EventSource[];
  sales_details?: SalesDetails | null;
}

export interface CrmRecordingTag {
  label: string;
  type: "account" | "opportunity";
}

export interface UnsyncedRecording {
  id: string;
  title: string;
  date: string;
  duration: string;
  selected: boolean;
  crm_tags?: CrmRecordingTag[];
}

// Workflow states: 0=CREATED, 1=TRANSCRIBING, 2=EXTRACTING, 3=REVIEW, 4=PUSHING, 5=DONE, 6=FAILED
export interface WorkflowTask {
  id: string;
  workflow_id: string;
  type: "plaud" | "local";
  recording_id: string;
  state: number;
  transcript?: string;
  error?: string;
}

export interface Workflow {
  id: string;
  event_id: string | null;
  state: number;
  extractions?: Record<string, { status: string; data?: Record<string, unknown>; error?: string }>;
  original_values?: Record<string, Record<string, unknown>>;
  tasks?: WorkflowTask[];
}

export interface WorkflowStreamEvent {
  workflow_state: number;
  tasks_total: number;
  tasks_completed: number;
  tasks_failed: number;
  message?: string;
  extractions?: Record<string, { status: string; data?: Record<string, unknown>; error?: string }>;
}

