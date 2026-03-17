"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { CrmChangeProposal, CrmChangeSection } from "@/lib/types";
import {
  Mic,
  Send,
  Bot,
  ChevronDown,
  ChevronRight,
  Calendar,
  ArrowRight,
  Check,
  CircleCheck,
} from "lucide-react";

interface ChatMessage {
  role: "ai" | "user";
  content?: string;
  type?: "proposal" | "applied" | "text";
  sections?: CrmChangeSection[];
  appliedSection?: CrmChangeSection;
}

export default function UpdateCrmReviewPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<CrmChangeProposal | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids = JSON.parse(
      sessionStorage.getItem("crm_selected_ids") || "[]"
    );
    if (ids.length === 0) return;

    setMessages([
      { role: "ai", content: "Analyzing your recordings...", type: "text" },
    ]);

    api
      .analyzeRecordings(ids)
      .then((data) => {
        setProposal(data);
        // Expand the first section by default
        if (data.sections.length > 0) {
          setExpandedSections(new Set([data.sections[0].category]));
        }
        setMessages([
          {
            role: "ai",
            type: "proposal",
            sections: data.sections,
          },
        ]);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const toggleSection = (category: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleConfirmAndContinue = async () => {
    if (!proposal) return;
    await api.confirmAll(proposal.session_id);
    sessionStorage.setItem("crm_session_id", proposal.session_id);
    sessionStorage.setItem("crm_proposal", JSON.stringify(proposal));
    router.push("/update-crm/processing");
  };

  const handleConfirmAll = async () => {
    if (!proposal) return;
    await api.confirmAll(proposal.session_id);
    sessionStorage.setItem("crm_session_id", proposal.session_id);
    sessionStorage.setItem("crm_proposal", JSON.stringify(proposal));
    router.push("/update-crm/processing");
  };

  const handleEdit = () => {
    if (!proposal) return;
    sessionStorage.setItem("crm_proposal", JSON.stringify(proposal));
    router.push("/update-crm/edit");
  };

  const handleSendMessage = () => {
    if (!inputText.trim()) return;
    setMessages((prev) => [
      ...prev,
      { role: "user", content: inputText.trim(), type: "text" },
    ]);
    const sent = inputText.trim();
    setInputText("");

    // Mock AI response after user message
    setTimeout(() => {
      if (proposal && proposal.sections.length > 0) {
        const lastSection = proposal.sections[proposal.sections.length - 1];
        setMessages((prev) => [
          ...prev,
          {
            role: "ai",
            type: "applied",
            appliedSection: lastSection,
          },
        ]);
      }
    }, 1000);
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "ai" && msg.type === "proposal" && proposal ? (
              /* Proposal card with AI avatar */
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-1 min-w-0 bg-white rounded-xl overflow-hidden">
                  {/* Meeting header */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-page)] rounded-t-xl">
                    <Calendar className="w-4 h-4 text-[var(--text-gray)]" />
                    <span className="text-[14px] font-semibold text-[var(--text-black)]">
                      {proposal.recording_title}
                    </span>
                  </div>

                  {/* Sections */}
                  {proposal.sections.map((section, si) => {
                    const isExpanded = expandedSections.has(section.category);
                    const sectionTitle = section.name
                      ? `${section.category}: ${section.name}`
                      : section.category;

                    return (
                      <div key={section.category}>
                        {si > 0 && (
                          <div className="h-px bg-[var(--border-line)]" />
                        )}

                        {/* Section header */}
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
                              {sectionTitle}
                            </span>
                          </div>
                          {isExpanded && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit();
                              }}
                              className="text-[14px] font-medium text-[var(--accent-blue)]"
                            >
                              Edit
                            </button>
                          )}
                        </button>

                        {/* Section fields (expanded) */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pl-10 space-y-0">
                            {section.fields.map((f, fi) => (
                              <div
                                key={fi}
                                className={`py-3 space-y-1 ${
                                  fi < section.fields.length - 1
                                    ? "border-b border-[var(--border-line)]"
                                    : ""
                                }`}
                              >
                                <p className="text-[13px] font-medium text-[var(--text-gray)]">
                                  {f.field}
                                </p>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[14px] text-[#B0B0B0]">
                                    {f.old_value}
                                  </span>
                                  <ArrowRight className="w-3.5 h-3.5 text-[var(--text-gray)]" />
                                  <span className="text-[14px] font-semibold text-[var(--accent-green)]">
                                    {f.new_value}
                                  </span>
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
                      onClick={handleConfirmAndContinue}
                      className="flex-1 py-2.5 bg-black text-white rounded-lg text-[14px] font-semibold text-center"
                    >
                      Confirm & Continue
                    </button>
                    <button
                      onClick={handleConfirmAll}
                      className="flex-1 py-2.5 bg-[var(--accent-green)] text-white rounded-lg text-[14px] font-semibold text-center"
                    >
                      Confirm All ({proposal.sections.length})
                    </button>
                  </div>
                </div>
              </div>
            ) : msg.role === "ai" && msg.type === "applied" && msg.appliedSection ? (
              /* Applied changes card with green avatar */
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-green)] flex items-center justify-center shrink-0">
                  <Check className="w-[18px] h-[18px] text-white" />
                </div>
                <div className="flex-1 min-w-0 bg-white rounded-xl overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-[#E8F5E9] rounded-t-xl">
                    <CircleCheck className="w-4 h-4 text-[var(--accent-green)]" />
                    <span className="text-[14px] font-semibold text-[var(--accent-green)]">
                      Changes Applied
                    </span>
                  </div>
                  <div className="px-4 py-4 space-y-3">
                    {msg.appliedSection.fields.map((f, fi) => (
                      <div key={fi} className="space-y-1">
                        <p className="text-[12px] font-medium text-[var(--text-gray)]">
                          {f.field}
                        </p>
                        <p className="text-[14px] font-semibold text-[var(--accent-green)]">
                          {f.new_value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : msg.role === "ai" ? (
              /* Plain AI text message */
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
                  <Bot className="w-[18px] h-[18px] text-white" />
                </div>
                <p className="text-[14px] leading-relaxed bg-white rounded-xl px-4 py-3">
                  {msg.content}
                </p>
              </div>
            ) : (
              /* User message */
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
          placeholder="Type a message..."
          className="flex-1 h-11 bg-[var(--bg-page)] rounded-full px-4 text-[14px] outline-none placeholder:text-[var(--text-gray)]"
        />
        <button className="w-11 h-11 rounded-full bg-[var(--bg-page)] flex items-center justify-center shrink-0">
          <Mic className="w-5 h-5 text-[var(--text-black)]" />
        </button>
        <button
          onClick={handleSendMessage}
          className="w-11 h-11 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
