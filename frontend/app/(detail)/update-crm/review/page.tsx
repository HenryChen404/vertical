"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { CrmChangeProposal, CrmChangeSection } from "@/lib/types";
import { Mic, Send, Bot, Check, Pencil } from "lucide-react";

interface ChatMessage {
  role: "ai" | "user";
  content: string;
  sections?: CrmChangeSection[];
}

export default function UpdateCrmReviewPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<CrmChangeProposal | null>(null);
  const [confirmedSections, setConfirmedSections] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ids = JSON.parse(sessionStorage.getItem("crm_selected_ids") || "[]");
    if (ids.length === 0) return;

    setMessages([{ role: "ai", content: "Analyzing your recordings..." }]);

    api.analyzeRecordings(ids).then((data) => {
      setProposal(data);
      setMessages([
        {
          role: "ai",
          content: `I've analyzed "${data.recording_title}" and found the following CRM updates:`,
          sections: data.sections,
        },
      ]);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleConfirmSection = async (category: string) => {
    if (!proposal) return;
    await api.confirmSection(proposal.session_id, category);
    setConfirmedSections((prev) => new Set(prev).add(category));

    const allConfirmed = proposal.sections.every(
      (s) => confirmedSections.has(s.category) || s.category === category
    );

    if (allConfirmed) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: "All sections confirmed" },
        { role: "ai", content: "All changes confirmed! Ready to update your CRM." },
      ]);
      setTimeout(() => {
        sessionStorage.setItem("crm_session_id", proposal.session_id);
        router.push("/update-crm/processing");
      }, 1500);
    }
  };

  const handleConfirmAll = async () => {
    if (!proposal) return;
    await api.confirmAll(proposal.session_id);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Confirm all changes" },
      { role: "ai", content: "All changes confirmed! Updating your CRM now..." },
    ]);
    setTimeout(() => {
      sessionStorage.setItem("crm_session_id", proposal.session_id);
      router.push("/update-crm/processing");
    }, 1500);
  };

  const handleEdit = () => {
    if (!proposal) return;
    sessionStorage.setItem("crm_proposal", JSON.stringify(proposal));
    router.push("/update-crm/edit");
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#F9F9F9]">
        {messages.map((msg, i) => (
          <div key={i}>
            {msg.role === "ai" ? (
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="space-y-3 flex-1 min-w-0">
                  <p className="text-[14px] leading-relaxed bg-white rounded-2xl rounded-tl-sm px-4 py-3">
                    {msg.content}
                  </p>
                  {msg.sections && msg.sections.map((section) => (
                    <div key={section.category} className="bg-white rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[14px] font-semibold">{section.category}</h4>
                        {confirmedSections.has(section.category) ? (
                          <span className="text-[12px] text-[#22C55E] flex items-center gap-1">
                            <Check className="w-3 h-3" /> Confirmed
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmSection(section.category)}
                            className="text-[12px] text-[#1A89FF] font-medium"
                          >
                            Confirm
                          </button>
                        )}
                      </div>
                      {section.fields.map((f, fi) => (
                        <div key={fi} className="space-y-0.5">
                          <p className="text-[12px] text-[#888]">{f.field}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-[#A3A3A3] line-through">{f.old_value}</span>
                            <span className="text-[13px]">→</span>
                            <span className="text-[13px] font-medium text-[#22C55E]">{f.new_value}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  {msg.sections && (
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmAll}
                        className="flex-1 h-10 bg-black text-white rounded-xl text-[13px] font-medium"
                      >
                        Confirm All
                      </button>
                      <button
                        onClick={handleEdit}
                        className="h-10 px-4 bg-white border border-[#EBEBEB] rounded-xl text-[13px] font-medium flex items-center gap-1"
                      >
                        <Pencil className="w-3 h-3" /> Edit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex justify-end">
                <p className="text-[14px] bg-[#1A89FF] text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                  {msg.content}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <div className="flex-1 h-11 bg-[#F9F9F9] rounded-full px-4 flex items-center">
          <span className="text-[14px] text-[#A3A3A3]">Type a message...</span>
        </div>
        <button className="w-11 h-11 rounded-full bg-[#F9F9F9] flex items-center justify-center">
          <Mic className="w-5 h-5 text-[#888]" />
        </button>
        <button className="w-11 h-11 rounded-full bg-[#1A89FF] flex items-center justify-center">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
