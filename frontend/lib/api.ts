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
  getDeals: () => fetchApi<import("./types").DealListItem[]>("/api/deals"),
  getDeal: (id: string) => fetchApi<import("./types").Deal>(`/api/deals/${id}`),
  syncDeals: () => fetchApi<{ fetched: number; created: number; updated: number }>("/api/deals/sync", { method: "POST" }),

  // Schedule
  getMeeting: (id: string) => fetchApi<import("./types").MeetingDetail>(`/api/schedule/${id}`),
  updateFeedback: (id: string, feedback: string) =>
    fetchApi<{ success: boolean; feedback: string }>(`/api/schedule/${id}/feedback`, {
      method: "PUT",
      body: JSON.stringify({ feedback }),
    }),
  transcribeFeedback: async (meetingId: string, blob: Blob) => {
    const form = new FormData();
    form.append("file", blob, "recording.webm");
    const res = await fetch(`${API_BASE}/api/schedule/${meetingId}/feedback/transcribe`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) throw new Error(`Transcription failed: ${res.status}`);
    return res.json() as Promise<{ success: boolean; feedback: string }>;
  },
  startRecording: (id: string) => fetchApi<{ success: boolean }>(`/api/schedule/${id}/recording/start`, { method: "POST" }),
  stopRecording: (id: string) => fetchApi<{ success: boolean }>(`/api/schedule/${id}/recording/stop`, { method: "POST" }),

  // CRM Update
  getUnsyncedRecordings: () => fetchApi<import("./types").UnsyncedRecording[]>("/api/crm-update/recordings"),

  // Workflows (real CRM update pipeline)
  createWorkflow: (recordingIds: string[], eventId?: string) =>
    fetchApi<import("./types").Workflow>("/api/workflows", {
      method: "POST",
      body: JSON.stringify({
        event_id: eventId ?? null,
        recordings: recordingIds.map((id) => ({ type: "plaud", id })),
      }),
    }),
  getWorkflow: (id: string) => fetchApi<import("./types").Workflow>(`/api/workflows/${id}`),
  getWorkflowMessages: (id: string) => fetchApi<import("./types").WorkflowMessage[]>(`/api/workflows/${id}/messages`),
  streamWorkflow: (id: string) => {
    const url = `${API_BASE}/api/workflows/${id}/stream`;
    return new EventSource(url, { withCredentials: true });
  },
  chatWorkflow: (id: string, message: string) =>
    fetchApi<{ extractions: { proposed_changes?: import("./types").ProposedChange[]; summary?: string }; messages: unknown[]; should_push: boolean }>(
      `/api/workflows/${id}/chat`,
      { method: "POST", body: JSON.stringify({ message }) },
    ),
  updateProposedChanges: (id: string, proposedChanges: import("./types").ProposedChange[]) =>
    fetchApi<unknown>(`/api/workflows/${id}/extractions`, {
      method: "PUT",
      body: JSON.stringify({ extractions: { proposed_changes: proposedChanges } }),
    }),
  confirmWorkflow: (id: string) =>
    fetchApi<{ status: string }>(`/api/workflows/${id}/confirm`, { method: "POST" }),
  transcribeVoice: async (audioBlob: Blob): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/workflows/transcribe-voice`, {
      method: "POST",
      headers: { "Content-Type": audioBlob.type || "audio/webm" },
      credentials: "include",
      body: audioBlob,
    });
    if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
    const data = await res.json();
    return data.text;
  },
};
