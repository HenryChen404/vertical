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

export interface Deal {
  id: string;
  name: string;
  org_name: string;
  sector: string;
  amount: string;
  stage: string;
  close_date: string;
  persons: Person[];
  meetings: { id: string; title: string; date: string }[];
  recordings: { id: string; title: string; date: string; duration: string }[];
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
  opportunity?: { name: string; amount: string; stage: string; close_date?: string } | null;
  attendees: Attendee[];
  feedback: string;
  linked_files: { id: string; title: string; duration_seconds: number; recorded_at?: string; plaud_file_id?: string }[];
  feedback_recordings?: { id: string; title: string; duration_seconds: number }[];
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

