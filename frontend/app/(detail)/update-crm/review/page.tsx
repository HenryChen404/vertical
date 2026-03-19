"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { WorkflowMessage, WorkflowStreamEvent, ProposedChange } from "@/lib/types";
import {
  Mic,
  Send,
  Bot,
  ArrowRight,
  FileAudio,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Briefcase,
  Building2,
  User,
} from "lucide-react";

const WF = { CREATED: 0, TRANSCRIBING: 1, ANALYZING: 2, REVIEW: 3, PUSHING: 4, DONE: 5, FAILED: 6 };

const SSE_LABELS: Record<number, string> = {
  [WF.CREATED]: "Preparing...",
  [WF.TRANSCRIBING]: "Transcribing recordings...",
  [WF.ANALYZING]: "Analyzing meeting data...",
};

export default function UpdateCrmReviewPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState(WF.CREATED);
  const [sseMessage, setSseMessage] = useState<string>("");
  const [sseProgress, setSseProgress] = useState<{ completed: number; total: number } | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  // Extract latest proposed_changes from messages
  const latestChanges = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const pc = messages[i].content.proposed_changes;
      if (pc && pc.length > 0) return pc;
    }
    return [] as ProposedChange[];
  }, [messages]);

  // Extract recording names from the first message that has them
  const recordingNames = useMemo(() => {
    for (const m of messages) {
      if (m.content.recordings && m.content.recordings.length > 0) return m.content.recordings;
    }
    return [] as string[];
  }, [messages]);

  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    if (!wfId) return;
    setWorkflowId(wfId);

    api.getWorkflowMessages(wfId).then(setMessages).catch(console.error);

    const es = api.streamWorkflow(wfId);
    es.onmessage = (event) => {
      try {
        const data: WorkflowStreamEvent = JSON.parse(event.data);
        setWorkflowState(data.workflow_state);

        if (data.workflow_state < WF.REVIEW) {
          setSseMessage(data.message || SSE_LABELS[data.workflow_state] || "Processing...");
          if (data.tasks_total > 0) {
            setSseProgress({ completed: data.tasks_completed, total: data.tasks_total });
          }
        } else {
          setSseMessage("");
          setSseProgress(null);
          api.getWorkflowMessages(wfId).then(setMessages);
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
  }, [messages, sseMessage, isThinking]);

  const handleConfirm = async () => {
    if (!workflowId || isPushing) return;
    setIsPushing(true);
    try {
      await api.confirmWorkflow(workflowId);
      const poll = setInterval(async () => {
        const wf = await api.getWorkflow(workflowId);
        if (wf.state === WF.DONE) {
          clearInterval(poll);
          setIsPushing(false);
          setWorkflowState(WF.DONE);
          // Add a success message to the chat
          setMessages((prev) => [
            ...prev,
            {
              id: `done-${Date.now()}`,
              workflow_id: workflowId,
              role: 1,
              content: { text: "All changes have been pushed to Salesforce successfully." },
              created_at: new Date().toISOString(),
            },
          ]);
        } else if (wf.state === WF.FAILED) {
          clearInterval(poll);
          setIsPushing(false);
          setMessages((prev) => [
            ...prev,
            {
              id: `fail-${Date.now()}`,
              workflow_id: workflowId,
              role: 1,
              content: { text: "Some changes failed to push. You can try again." },
              created_at: new Date().toISOString(),
            },
          ]);
        }
      }, 1500);
    } catch (e) {
      console.error("Push failed:", e);
      setIsPushing(false);
    }
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

    const optimisticMsg: WorkflowMessage = {
      id: `temp-${Date.now()}`,
      workflow_id: workflowId,
      role: 0,
      content: { text },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsThinking(true);

    try {
      const result = await api.chatWorkflow(workflowId, text);
      setIsThinking(false);
      if (result.should_push) {
        router.push("/update-crm/processing");
        return;
      }
      const msgs = await api.getWorkflowMessages(workflowId);
      setMessages(msgs);
    } catch (e) {
      console.error("Chat error:", e);
      setIsThinking(false);
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

  const toggleListening = async () => {
    if (isListening) {
      // Stop recording
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
        try {
          const text = await api.transcribeVoice(audioBlob);
          if (text) setInputText((prev) => (prev ? prev + " " + text : text));
        } catch (e) {
          console.error("Voice transcription failed:", e);
        }
      };

      recognitionRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch (e) {
      console.error("Mic access failed:", e);
    }
  };

  const isProcessing = workflowState < WF.REVIEW;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* AI thinking bubble during processing */}
        {isProcessing && (
          <ThinkingBubble>
            {workflowState === WF.TRANSCRIBING && sseProgress && sseProgress.total > 0
              ? `Transcribing recordings (${sseProgress.completed}/${sseProgress.total})...`
              : sseMessage || SSE_LABELS[workflowState] || "Thinking..."}
          </ThinkingBubble>
        )}

        {/* Messages — all rendered as pure text, no cards */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 1 ? (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {msg.content.text && (
                    <div className="text-[14px] leading-relaxed bg-white rounded-xl px-4 py-3 border border-[#E8E8E8] prose prose-sm prose-neutral max-w-none w-fit">
                      <ReactMarkdown>{msg.content.text}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <p className="text-[14px] bg-black text-white rounded-2xl px-3.5 py-2.5 max-w-[240px]">
                  {msg.content.text}
                </p>
              </div>
            )}
          </div>
        ))}

        {/* Thinking bubble */}
        {isThinking && <ThinkingBubble>Thinking...</ThinkingBubble>}
      </div>

      {/* Bottom panel — drawer on top, input below */}
      <div className="shrink-0 bg-[#EAEAEA] rounded-t-2xl shadow-[0_-4px_16px_rgba(0,0,0,0.06)] border-t border-x border-[#D8D8D8]">
        {/* Drawer handle — above input, feels tucked/folded */}
        {latestChanges.length > 0 && (
          <div>
            <button
              onClick={() => setDrawerOpen((prev) => !prev)}
              className="flex items-center justify-between w-full px-4 py-2.5 cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {drawerOpen ? (
                  <ChevronDown className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
                ) : (
                  <ChevronUp className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
                )}
                <FileAudio className="w-3.5 h-3.5 text-[var(--text-gray)] shrink-0" />
                <span className="text-[13px] font-medium text-[var(--text-gray)] truncate">
                  {recordingNames.length > 0 ? recordingNames[0] : "Analysis Result"}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!isPushing && workflowState !== WF.DONE && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                    className="text-[12px] font-semibold text-[#555] px-2 py-0.5 rounded-md hover:bg-[#F0F0F0] transition-colors"
                  >
                    Edit
                  </button>
                )}
                {workflowState !== WF.DONE && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleConfirm(); }}
                    disabled={isPushing}
                    className="text-[12px] font-semibold text-white bg-black px-2.5 py-1 rounded-lg disabled:opacity-50"
                  >
                    {isPushing ? "Pushing..." : "Push"}
                  </button>
                )}
                {workflowState === WF.DONE && (
                  <span className="text-[12px] font-semibold text-[var(--accent-green)]">Synced</span>
                )}
              </div>
            </button>

            {/* Expanded content — opens upward between handle and chat */}
            {drawerOpen && (
              <div className="max-h-[50vh] overflow-y-auto border-t border-[#F0F0F0]">
                <ChangesDrawerContent changes={latestChanges} />
              </div>
            )}

          </div>
        )}

        {/* Input area — with top border radius to visually sit on top of drawer */}
        <div className="flex items-center gap-3 px-4 pt-5 pb-8 bg-white rounded-t-2xl border-t border-[#EBEBEB] relative z-10">
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
            <button
              className={`shrink-0 ml-1 relative w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isListening ? "bg-black" : ""}`}
              onClick={toggleListening}
            >
              {isListening && (
                <span className="absolute inset-0 rounded-full bg-black/30 animate-ping" />
              )}
              <Mic className={`w-[18px] h-[18px] relative z-10 ${isListening ? "text-white" : "text-[var(--text-gray)]"}`} />
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
    </div>
  );
}

// --- Thinking bubble ---

function ThinkingBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
        <Bot className="w-[18px] h-[18px] text-white" />
      </div>
      <div className="bg-white rounded-xl px-4 py-3 border border-[#E8E8E8] w-fit">
        <div className="flex items-center gap-2.5">
          <div className="flex items-end gap-1 h-5">
            <span className="w-[7px] h-[7px] bg-[#999] rounded-full animate-[bigBounce_1.4s_ease-in-out_infinite_0ms]" />
            <span className="w-[7px] h-[7px] bg-[#999] rounded-full animate-[bigBounce_1.4s_ease-in-out_infinite_200ms]" />
            <span className="w-[7px] h-[7px] bg-[#999] rounded-full animate-[bigBounce_1.4s_ease-in-out_infinite_400ms]" />
          </div>
          <span className="text-[14px] text-[var(--text-gray)]">{children}</span>
        </div>
      </div>
    </div>
  );
}

// --- Changes drawer content ---

function ChangesDrawerContent({ changes }: { changes: ProposedChange[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const idToRecord = new Map<string, { type: string; name: string }>();
  for (const c of changes) {
    if (c.record_id) {
      idToRecord.set(c.record_id, { type: c.object_type, name: c.object_name || c.object_type });
    }
  }

  return (
    <div>
      {changes.map((change, ci) => {
        const isExpanded = expandedIds.has(change.id);
        const regularFields = change.changes.filter((d) => !/Id$/.test(d.field));
        const relatedFields = change.changes.filter((d) => /Id$/.test(d.field));

        return (
          <div key={change.id}>
            {ci > 0 && <div className="h-px bg-[#F0F0F0]" />}

            <button
              onClick={() => toggleExpand(change.id)}
              className="flex items-center gap-2 w-full px-4 py-3 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
              )}
              <span className={`text-[14px] font-semibold flex-1 ${change.approved ? "text-[var(--text-black)]" : "text-[var(--text-gray)] line-through"}`}>
                {change.action === "create" ? `New ${change.object_type}` : change.object_type}
                {change.object_name && `: ${change.object_name}`}
              </span>
            </button>

            {isExpanded && (
              <div className={`px-4 pb-3 pl-[36px] space-y-2 ${!change.approved ? "opacity-40" : ""}`}>
                {relatedFields.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {relatedFields.map((ref, ri) => {
                      const resolved = idToRecord.get(ref.new);
                      const icon = resolved?.type === "Opportunity" ? (
                        <Briefcase className="w-3 h-3" />
                      ) : resolved?.type === "Account" ? (
                        <Building2 className="w-3 h-3" />
                      ) : resolved?.type === "Contact" ? (
                        <User className="w-3 h-3" />
                      ) : null;
                      return (
                        <span key={ri} className="inline-flex items-center gap-1 text-[12px] text-[#555] bg-[#F0F0F0] rounded-md px-2 py-0.5">
                          {icon}
                          {resolved?.name || ref.new}
                        </span>
                      );
                    })}
                  </div>
                )}

                {regularFields.map((diff, di) => (
                  <div key={di}>
                    <p className="text-[14px] font-semibold text-[var(--text-black)]">{diff.label}</p>
                    <div className="mt-0.5">
                      {diff.old != null && diff.old !== "" ? (
                        <span className="flex items-start gap-1.5">
                          <span className="text-[13px] text-[var(--text-gray)] line-through">{diff.old}</span>
                          <ArrowRight className="w-3 h-3 text-[var(--text-gray)] shrink-0 mt-0.5" />
                          <span className="text-[13px] font-medium text-[var(--accent-green)]">{diff.new}</span>
                        </span>
                      ) : (
                        <span className="text-[13px] text-[#444]">{diff.new}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
