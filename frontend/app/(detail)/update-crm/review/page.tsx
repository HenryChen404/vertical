"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { WorkflowMessage, WorkflowStreamEvent } from "@/lib/types";
import {
  Mic,
  Send,
  Bot,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Loader,
  FileAudio,
} from "lucide-react";

const WF = { CREATED: 0, TRANSCRIBING: 1, EXTRACTING: 2, REVIEW: 3, PUSHING: 4, DONE: 5, FAILED: 6 };

const DIMENSION_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  contact: "Contact",
  account: "Account",
  event_summary: "Event Summary",
};

/** Pretty-print a field name: snake_case → Title Case */
function formatFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a value is a simple scalar (not array/object) */
function isSimpleValue(val: unknown): boolean {
  return val == null || typeof val !== "object";
}

/** Format a simple scalar value */
function formatSimple(val: unknown): string {
  if (val == null || val === "") return "—";
  return String(val);
}

/** Extract display text from an object (pick the most meaningful field) */
function objectToText(obj: Record<string, unknown>): string {
  // Try common text fields in priority order
  for (const key of ["task", "name", "title", "description", "text", "label", "summary"]) {
    if (obj[key] && typeof obj[key] === "string") return obj[key] as string;
  }
  // Fallback: first string value
  for (const v of Object.values(obj)) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return JSON.stringify(obj);
}

/** Render a complex value (array or object) as a list */
function FieldValue({ value }: { value: unknown }) {
  if (value == null || value === "") {
    return <span className="text-[14px] text-[var(--text-gray)]">—</span>;
  }

  // Array of items
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-[14px] text-[var(--text-gray)]">—</span>;
    return (
      <ol className="list-decimal list-inside space-y-1 mt-1">
        {value.map((item, i) => (
          <li key={i} className="text-[13px] text-[#444]">
            {typeof item === "object" && item !== null ? objectToText(item as Record<string, unknown>) : String(item)}
          </li>
        ))}
      </ol>
    );
  }

  // Object
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v != null && v !== "" && v !== "null"
    );
    if (entries.length === 0) return <span className="text-[14px] text-[var(--text-gray)]">—</span>;
    return (
      <div className="space-y-1 mt-1">
        {entries.map(([k, v]) => (
          <div key={k} className="text-[14px] text-[var(--text-black)]">
            <span className="text-[var(--text-gray)]">{formatFieldName(k)}:</span> {formatSimple(v)}
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-[14px] font-semibold text-[var(--accent-green)]">{String(value)}</span>;
}

export default function UpdateCrmReviewPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState("");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState(WF.CREATED);
  const [sseMessage, setSseMessage] = useState<string>("Starting...");
  const [sseProgress, setSseProgress] = useState<{ completed: number; total: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages + connect SSE
  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    if (!wfId) return;
    setWorkflowId(wfId);

    // Load existing messages
    api.getWorkflowMessages(wfId).then(setMessages).catch(console.error);

    // Connect SSE for live progress
    const es = api.streamWorkflow(wfId);

    es.onmessage = (event) => {
      try {
        const data: WorkflowStreamEvent = JSON.parse(event.data);
        setWorkflowState(data.workflow_state);

        if (data.workflow_state === WF.TRANSCRIBING || data.workflow_state === WF.EXTRACTING) {
          setSseMessage(data.message || "Processing...");
          if (data.tasks_total > 0) {
            setSseProgress({ completed: data.tasks_completed, total: data.tasks_total });
          }
        } else if (data.workflow_state >= WF.REVIEW) {
          setSseMessage("");
          setSseProgress(null);
          // Reload messages to get extraction results
          api.getWorkflowMessages(wfId).then((msgs) => {
            setMessages(msgs);
            // Auto-expand first extraction dimension
            const lastExtraction = [...msgs].reverse().find(
              (m) => m.role === 1 && m.content.extractions
            );
            if (lastExtraction?.content.extractions) {
              const firstDim = Object.keys(lastExtraction.content.extractions)[0];
              if (firstDim) setExpandedDims(new Set([firstDim]));
            }
          });
          if (data.workflow_state === WF.DONE || data.workflow_state === WF.FAILED) {
            es.close();
          }
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sseMessage]);

  const toggleDim = (dim: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return next;
    });
  };

  const handleConfirm = () => {
    if (!workflowId) return;
    sessionStorage.setItem("crm_workflow_id", workflowId);
    router.push("/update-crm/processing");
  };

  const handleEdit = () => {
    if (!workflowId) return;
    sessionStorage.setItem("crm_workflow_id", workflowId);
    router.push("/update-crm/edit");
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !workflowId) return;
    const text = inputText.trim();
    setInputText("");

    // Optimistic user message
    const optimisticMsg: WorkflowMessage = {
      id: `temp-${Date.now()}`,
      workflow_id: workflowId,
      role: 0,
      content: { text },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const result = await api.chatWorkflow(workflowId, text);
      if (result.should_push) {
        router.push("/update-crm/processing");
        return;
      }
      // Reload messages from server
      const msgs = await api.getWorkflowMessages(workflowId);
      setMessages(msgs);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          workflow_id: workflowId,
          role: 1,
          content: { text: "Something went wrong. Please try again." },
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const isProcessing = workflowState < WF.REVIEW;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* SSE progress indicator (shown during transcription/extraction) */}
        {isProcessing && sseMessage && (
          <div className="flex items-start gap-2">
            <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
              <Bot className="w-[18px] h-[18px] text-white" />
            </div>
            <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Loader className="w-[18px] h-[18px] text-[var(--accent-blue)] animate-spin" />
                <span className="text-[15px] font-semibold text-[var(--text-black)]">
                  {sseMessage}
                </span>
              </div>
              {sseProgress && sseProgress.total > 0 && (
                <>
                  <div className="w-full h-2 bg-[var(--bg-page)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((sseProgress.completed / sseProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[13px] text-[var(--text-gray)]">
                    {sseProgress.completed}/{sseProgress.total} recordings
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Persisted messages */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 1 ? (
              /* Assistant message */
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Text content */}
                  {msg.content.text && !msg.content.extractions && (
                    <div className="text-[14px] leading-relaxed bg-white rounded-xl px-4 py-3 prose prose-sm prose-neutral max-w-none">
                      <ReactMarkdown>{msg.content.text}</ReactMarkdown>
                    </div>
                  )}

                  {/* Extraction card */}
                  {msg.content.extractions && (
                    <div className="bg-white rounded-xl overflow-hidden">
                      {/* Recording file header */}
                      {msg.content.recordings && msg.content.recordings.length > 0 && (
                        <div className="flex items-center gap-2 bg-[var(--bg-page)] rounded-t-xl px-4 py-3">
                          <FileAudio className="w-4 h-4 text-[var(--text-gray)]" />
                          <span className="text-[14px] font-semibold text-[var(--text-black)]">
                            {msg.content.recordings.join(", ")}
                          </span>
                        </div>
                      )}
                      {msg.content.text && (
                        <div className="px-4 pt-3 pb-2">
                          <p className="text-[14px] text-[var(--text-black)]">{msg.content.text}</p>
                        </div>
                      )}
                      {Object.entries(msg.content.extractions).map(([dim, ext], di) => {
                        if (ext.status !== "completed" || !ext.data) return null;
                        const isExpanded = expandedDims.has(dim);
                        const fields = Object.entries(ext.data);
                        return (
                          <div key={dim}>
                            {di > 0 && <div className="h-px bg-[var(--border-line)]" />}
                            <button
                              onClick={() => toggleDim(dim)}
                              className="w-full flex items-center justify-between px-4 py-4"
                            >
                              <div className="flex items-center gap-2">
                                {isExpanded ? (
                                  <ChevronDown className="w-[18px] h-[18px] text-[var(--text-black)]" />
                                ) : (
                                  <ChevronRight className="w-[18px] h-[18px] text-[var(--text-black)]" />
                                )}
                                <span className="text-[15px] font-semibold text-[var(--text-black)]">
                                  {DIMENSION_LABELS[dim] || dim}
                                </span>
                                <span className="text-[13px] text-[var(--text-gray)]">
                                  {fields.length} fields
                                </span>
                              </div>
                              {isExpanded && (
                                <span
                                  role="button"
                                  onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                                  className="text-[14px] font-medium text-[var(--accent-blue)]"
                                >
                                  Edit
                                </span>
                              )}
                            </button>
                            {isExpanded && (
                              <div className="px-4 pb-4 pl-10 space-y-0">
                                {fields.map(([field, value], fi) => (
                                  <div
                                    key={field}
                                    className={`py-3 space-y-1 ${fi < fields.length - 1 ? "border-b border-[var(--border-line)]" : ""}`}
                                  >
                                    <p className="text-[14px] font-semibold text-[var(--text-black)]">
                                      {formatFieldName(field)}
                                    </p>
                                    {isSimpleValue(value) ? (
                                      String(value ?? "").length > 80 ? (
                                        <p className="text-[13px] text-[#444] mt-1 leading-relaxed">
                                          {formatSimple(value)}
                                        </p>
                                      ) : (
                                        <div className="flex items-center gap-1.5">
                                          <ArrowRight className="w-3.5 h-3.5 text-[var(--text-gray)]" />
                                          <span className="text-[14px] font-semibold text-[var(--accent-green)]">
                                            {formatSimple(value)}
                                          </span>
                                        </div>
                                      )
                                    ) : (
                                      <FieldValue value={value} />
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Action buttons */}
                      <div className="flex gap-3 px-4 py-4">
                        <button
                          onClick={handleConfirm}
                          className="flex-1 py-2.5 bg-black text-white rounded-lg text-[14px] font-semibold text-center"
                        >
                          Confirm & Push
                        </button>
                        <button
                          onClick={handleEdit}
                          className="flex-1 py-2.5 border border-[var(--border-line)] rounded-lg text-[14px] font-semibold text-center text-[var(--text-black)]"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* User message */
              <div className="flex justify-end">
                <p className="text-[14px] bg-[#007AFF] text-white rounded-2xl px-3.5 py-2.5 max-w-[240px]">
                  {msg.content.text}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-8 bg-white shrink-0 border-t border-[#EBEBEB]">
        <div className="flex-1 flex items-center h-11 bg-[#F0F0F0] rounded-full px-4">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder={isProcessing ? "Processing..." : "Type a message..."}
            disabled={isProcessing}
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--text-gray)] disabled:opacity-50"
          />
          <button className="shrink-0 ml-2">
            <Mic className="w-5 h-5 text-[var(--text-gray)]" />
          </button>
        </div>
        <button
          onClick={handleSendMessage}
          disabled={isProcessing}
          className="w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
