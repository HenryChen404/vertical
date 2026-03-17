const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  // Auth
  auth: {
    login: () => fetchApi<{ url: string }>("/api/auth/login"),
    logout: () => fetchApi<{ success: boolean }>("/api/auth/logout", { method: "POST" }),
    me: () =>
      fetchApi<{
        id: string;
        plaud_user_id?: string;
        name?: string;
        avatar_url?: string;
        authenticated: boolean;
      }>("/api/auth/me"),
  },

  // Files / Recordings
  getFiles: () => fetchApi<import("./types").RecordingFile[]>("/api/files"),
  uploadRecording: async (eventId: string, blob: Blob, title?: string, durationSeconds?: number) => {
    const form = new FormData();
    form.append("file", blob, "recording.webm");
    if (title) form.append("title", title);
    if (durationSeconds !== undefined) form.append("duration_seconds", String(Math.round(durationSeconds)));
    const res = await fetch(`${API_BASE}/api/events/${eventId}/recordings/upload`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },
  linkRecording: (recordingId: string, eventId: string) =>
    fetchApi<{ success: boolean }>(`/api/recordings/${recordingId}/link`, {
      method: "POST",
      body: JSON.stringify({ event_id: eventId }),
    }),
  unlinkRecording: (recordingId: string) =>
    fetchApi<{ success: boolean }>(`/api/recordings/${recordingId}/unlink`, { method: "POST" }),

  // Sales
  getSchedule: () => fetchApi<{ today: import("./types").ScheduleMeeting[]; tomorrow: import("./types").ScheduleMeeting[] }>("/api/sales/schedule"),

  // Integrations
  getCrmStatus: () => fetchApi<{ connected: boolean; provider?: string }>("/api/integrations/crm/status"),
  getCalendarStatus: () => fetchApi<{ connected: boolean; provider?: string }>("/api/integrations/calendar/status"),
  initiateConnection: (provider: string, redirectUrl: string) =>
    fetchApi<{ redirect_url?: string; connected_account_id?: string; success?: boolean }>(
      "/api/integrations/connect",
      { method: "POST", body: JSON.stringify({ provider, redirect_url: redirectUrl }) },
    ),
  /** Build URL for server-side 302 redirect to OAuth provider. Use with window.location.href. */
  getConnectRedirectUrl: (provider: string, callbackUrl: string) =>
    `${API_BASE}/api/integrations/connect/redirect?provider=${encodeURIComponent(provider)}&callback_url=${encodeURIComponent(callbackUrl)}`,
  disconnectProvider: (provider: string) =>
    fetchApi<{ success: boolean; deleted?: number }>(
      "/api/integrations/disconnect",
      { method: "POST", body: JSON.stringify({ provider }) },
    ),
  verifyApiAccess: (provider: string) =>
    fetchApi<{ api_enabled: boolean; error?: string; mock?: boolean }>(
      `/api/integrations/${provider}/verify-api`,
    ),

  // Events (real calendar data)
  syncEvents: (daysAhead = 7) =>
    fetchApi<{ fetched: number; merged: number; created: number; updated: number }>(
      `/api/sales/events/sync?days_ahead=${daysAhead}`,
      { method: "POST" },
    ),
  getEvents: (range: "today" | "tomorrow" | "week" = "week") =>
    fetchApi<{ events: import("./types").CalendarEvent[] }>(`/api/sales/events?range=${range}`),
  getEvent: (id: string) => fetchApi<import("./types").CalendarEvent>(`/api/sales/events/${id}`),

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
