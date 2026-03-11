const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Files
  getFiles: () => fetchApi<import("./types").RecordingFile[]>("/api/files"),

  // Sales
  getSchedule: () => fetchApi<{ today: import("./types").ScheduleMeeting[]; tomorrow: import("./types").ScheduleMeeting[] }>("/api/sales/schedule"),

  // Integrations
  getCrmStatus: () => fetchApi<{ connected: boolean; provider?: string }>("/api/integrations/crm/status"),
  connectCrm: (provider: string) => fetchApi<{ success: boolean }>("/api/integrations/crm/connect", { method: "POST", body: JSON.stringify({ provider }) }),
  getCalendarStatus: () => fetchApi<{ connected: boolean; provider?: string }>("/api/integrations/calendar/status"),
  connectCalendar: (provider: string) => fetchApi<{ success: boolean }>("/api/integrations/calendar/connect", { method: "POST", body: JSON.stringify({ provider }) }),

  // Deals
  getDeal: (id: string) => fetchApi<import("./types").Deal>(`/api/deals/${id}`),

  // Schedule
  getMeeting: (id: string) => fetchApi<import("./types").MeetingDetail>(`/api/schedule/${id}`),
  startRecording: (id: string) => fetchApi<{ success: boolean }>(`/api/schedule/${id}/recording/start`, { method: "POST" }),
  stopRecording: (id: string) => fetchApi<{ success: boolean }>(`/api/schedule/${id}/recording/stop`, { method: "POST" }),

  // CRM Update
  getUnsyncedRecordings: () => fetchApi<import("./types").UnsyncedRecording[]>("/api/crm-update/recordings"),
  analyzeRecordings: (ids: string[]) => fetchApi<import("./types").CrmChangeProposal>("/api/crm-update/analyze", { method: "POST", body: JSON.stringify({ recording_ids: ids }) }),
  confirmSection: (sessionId: string, category: string) => fetchApi<{ success: boolean }>("/api/crm-update/confirm", { method: "POST", body: JSON.stringify({ session_id: sessionId, category }) }),
  confirmAll: (sessionId: string) => fetchApi<{ success: boolean }>("/api/crm-update/confirm-all", { method: "POST", body: JSON.stringify({ session_id: sessionId }) }),
  saveChanges: (sessionId: string, sections: import("./types").CrmChangeSection[]) => fetchApi<{ success: boolean }>("/api/crm-update/changes", { method: "PUT", body: JSON.stringify({ session_id: sessionId, sections }) }),
  applyChanges: (sessionId: string) => fetchApi<{ success: boolean }>("/api/crm-update/apply", { method: "POST", body: JSON.stringify({ session_id: sessionId }) }),
  getUpdateStatus: (sessionId: string) => fetchApi<import("./types").CrmUpdateProgress>(`/api/crm-update/status?session_id=${sessionId}`),
};
