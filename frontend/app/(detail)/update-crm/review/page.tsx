"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { CrmChangeSection, FieldChange, WorkflowStreamEvent } from "@/lib/types";
import {
  Mic,
  Send,
  Bot,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  Loader,
} from "lucide-react";

// Workflow states
const WF = { CREATED: 0, TRANSCRIBING: 1, EXTRACTING: 2, REVIEW: 3, PUSHING: 4, DONE: 5, FAILED: 6 };

const DIMENSION_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  contact: "Contact",
  account: "Account",
  event_summary: "Event Summary",
};

/** Transform workflow extractions + original_values into CrmChangeSection[] */
function buildSections(
  extractions: Record<string, { status: string; data?: Record<string, unknown> }>,
  originalValues: Record<string, Record<string, unknown>>,
): CrmChangeSection[] {
  const sections: CrmChangeSection[] = [];
  for (const [dim, ext] of Object.entries(extractions)) {
    if (ext.status !== "completed" || !ext.data) continue;
    const original = originalValues[dim] || {};
    const fields: FieldChange[] = [];
    for (const [field, newVal] of Object.entries(ext.data)) {
      const oldVal = original[field] ?? "";
      const newStr = newVal == null ? "" : String(newVal);
      const oldStr = oldVal == null ? "" : String(oldVal);
      if (newStr && newStr !== oldStr) {
        fields.push({ field, old_value: oldStr, new_value: newStr });
      }
    }
    if (fields.length > 0) {
      sections.push({
        category: DIMENSION_LABELS[dim] || dim,
        fields,
        confirmed: false,
      });
    }
  }
  return sections;
}

interface ChatMessage {
  role: "ai" | "user";
  content?: string;
  type?: "proposal" | "progress" | "text";
  sections?: CrmChangeSection[];
  progress?: { completed: number; total: number; message: string };
}

export default function UpdateCrmReviewPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sections, setSections] = useState<CrmChangeSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [inputText, setInputText] = useState("");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState(WF.CREATED);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Connect to workflow SSE stream
  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    if (!wfId) return;
    setWorkflowId(wfId);

    setMessages([{ role: "ai", content: "Starting transcription...", type: "progress", progress: { completed: 0, total: 0, message: "Starting..." } }]);

    const es = api.streamWorkflow(wfId);

    es.onmessage = (event) => {
      try {
        const data: WorkflowStreamEvent = JSON.parse(event.data);
        setWorkflowState(data.workflow_state);

        if (data.workflow_state === WF.TRANSCRIBING) {
          setMessages([{
            role: "ai",
            type: "progress",
            progress: {
              completed: data.tasks_completed,
              total: data.tasks_total,
              message: data.message || "Transcribing...",
            },
          }]);
        } else if (data.workflow_state === WF.EXTRACTING) {
          setMessages([{
            role: "ai",
            type: "progress",
            progress: {
              completed: data.tasks_completed,
              total: data.tasks_total,
              message: "Extracting CRM data from transcripts...",
            },
          }]);
        } else if (data.workflow_state === WF.REVIEW && data.extractions) {
          // Fetch full workflow to get original_values
          api.getWorkflow(wfId).then((wf) => {
            const built = buildSections(
              data.extractions!,
              (wf.original_values || {}) as Record<string, Record<string, unknown>>,
            );
            setSections(built);
            if (built.length > 0) {
              setExpandedSections(new Set([built[0].category]));
            }
            setMessages([{ role: "ai", type: "proposal", sections: built }]);
          });
          es.close();
        } else if (data.workflow_state === WF.FAILED) {
          setMessages([{ role: "ai", content: "Workflow failed. Please try again.", type: "text" }]);
          es.close();
        } else if (data.workflow_state === WF.DONE) {
          es.close();
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    es.onerror = () => {
      // SSE may close naturally when workflow reaches terminal state
      es.close();
    };

    return () => es.close();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const toggleSection = (category: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
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
    sessionStorage.setItem("crm_sections", JSON.stringify(sections));
    router.push("/update-crm/edit");
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !workflowId) return;
    const text = inputText.trim();
    setMessages((prev) => [...prev, { role: "user", content: text, type: "text" }]);
    setInputText("");

    try {
      const result = await api.chatWorkflow(workflowId, text);
      if (result.should_push) {
        router.push("/update-crm/processing");
        return;
      }
      // Rebuild sections from updated extractions
      const wf = await api.getWorkflow(workflowId);
      const built = buildSections(
        result.extractions as Record<string, { status: string; data?: Record<string, unknown> }>,
        (wf.original_values || {}) as Record<string, Record<string, unknown>>,
      );
      setSections(built);
      setMessages((prev) => [...prev, { role: "ai", type: "proposal", sections: built }]);
    } catch (e) {
      console.error("Chat error:", e);
      setMessages((prev) => [...prev, { role: "ai", content: "Something went wrong. Please try again.", type: "text" }]);
    }
  };

  const isProcessing = workflowState < WF.REVIEW;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i}>
            {/* Progress message (transcribing / extracting) */}
            {msg.role === "ai" && msg.type === "progress" && msg.progress ? (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                  <Loader className="w-[18px] h-[18px] text-white animate-spin" />
                </div>
                <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Loader className="w-[18px] h-[18px] text-[var(--accent-blue)] animate-spin" />
                    <span className="text-[15px] font-semibold text-[var(--text-black)]">
                      {msg.progress.message}
                    </span>
                  </div>
                  {msg.progress.total > 0 && (
                    <>
                      <div className="w-full h-2 bg-[var(--bg-page)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-500"
                          style={{ width: `${Math.round((msg.progress.completed / msg.progress.total) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[13px] text-[var(--text-gray)]">
                        {msg.progress.completed}/{msg.progress.total} recordings
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : msg.role === "ai" && msg.type === "proposal" && msg.sections ? (
              /* Proposal card */
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-1 min-w-0 bg-white rounded-xl overflow-hidden">
                  {/* Sections */}
                  {msg.sections.map((section, si) => {
                    const isExpanded = expandedSections.has(section.category);
                    return (
                      <div key={section.category}>
                        {si > 0 && <div className="h-px bg-[var(--border-line)]" />}
                        <button
                          onClick={() => toggleSection(section.category)}
                          className="w-full flex items-center justify-between px-4 py-4"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? (
                              <ChevronDown className="w-[18px] h-[18px] text-[var(--text-black)]" />
                            ) : (
                              <ChevronRight className="w-[18px] h-[18px] text-[var(--text-black)]" />
                            )}
                            <span className="text-[15px] font-semibold text-[var(--text-black)]">
                              {section.category}
                            </span>
                          </div>
                          {isExpanded && (
                            <span
                              role="button"
                              onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                              className="text-[14px] font-medium text-[var(--accent-blue)] cursor-pointer"
                            >
                              Edit
                            </span>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 pl-10 space-y-0">
                            {section.fields.map((f, fi) => (
                              <div
                                key={fi}
                                className={`py-3 space-y-1 ${fi < section.fields.length - 1 ? "border-b border-[var(--border-line)]" : ""}`}
                              >
                                <p className="text-[13px] font-medium text-[var(--text-gray)]">{f.field}</p>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[14px] text-[#B0B0B0]">{f.old_value || "—"}</span>
                                  <ArrowRight className="w-3.5 h-3.5 text-[var(--text-gray)]" />
                                  <span className="text-[14px] font-semibold text-[var(--accent-green)]">{f.new_value}</span>
                                </div>
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
              </div>
            ) : msg.role === "ai" ? (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <p className="text-[14px] leading-relaxed bg-white rounded-xl px-4 py-3">
                  {msg.content}
                </p>
              </div>
            ) : (
              <div className="flex justify-end">
                <p className="text-[14px] bg-[#007AFF] text-white rounded-2xl px-3.5 py-2.5 max-w-[240px]">
                  {msg.content}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder={isProcessing ? "Processing..." : "Type a message..."}
          disabled={isProcessing}
          className="flex-1 h-11 bg-[var(--bg-page)] rounded-full px-4 text-[14px] outline-none placeholder:text-[var(--text-gray)] disabled:opacity-50"
        />
        <button className="w-11 h-11 rounded-full bg-[var(--bg-page)] flex items-center justify-center shrink-0">
          <Mic className="w-5 h-5 text-[var(--text-black)]" />
        </button>
        <button
          onClick={handleSendMessage}
          disabled={isProcessing}
          className="w-11 h-11 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
