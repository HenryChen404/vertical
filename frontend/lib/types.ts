export interface RecordingFile {
  id: string;
  title: string;
  timestamp: string;
  duration_seconds: number;
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
  title: string;
  company: string;
  avatar_url?: string;
}

export interface MeetingDetail {
  id: string;
  title: string;
  date: string;
  time_start: string;
  time_end: string;
  location: string;
  account: { name: string; sector: string };
  opportunity: { name: string; amount: string; stage: string };
  attendees: Attendee[];
  feedback: string;
  linked_files: { id: string; title: string; duration: string }[];
}

export interface FieldChange {
  field: string;
  old_value: string;
  new_value: string;
}

export interface CrmChangeSection {
  category: string;
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

export interface UnsyncedRecording {
  id: string;
  title: string;
  date: string;
  duration: string;
  selected: boolean;
}
