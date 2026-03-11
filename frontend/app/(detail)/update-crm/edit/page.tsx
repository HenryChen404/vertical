"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { Calendar } from "lucide-react";
import type { CrmChangeProposal, CrmChangeSection } from "@/lib/types";
import { api } from "@/lib/api";

export default function UpdateCrmEditPage() {
  const router = useRouter();
  const [proposal, setProposal] = useState<CrmChangeProposal | null>(null);
  const [sections, setSections] = useState<CrmChangeSection[]>([]);

  useEffect(() => {
    const data = sessionStorage.getItem("crm_proposal");
    if (data) {
      const parsed = JSON.parse(data) as CrmChangeProposal;
      setProposal(parsed);
      setSections(parsed.sections);
    }
  }, []);

  const updateField = (sectionIdx: number, fieldIdx: number, newValue: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[sectionIdx] = {
        ...next[sectionIdx],
        fields: next[sectionIdx].fields.map((f, i) =>
          i === fieldIdx ? { ...f, new_value: newValue } : f
        ),
      };
      return next;
    });
  };

  const handleSave = async () => {
    if (!proposal) return;
    await api.saveChanges(proposal.session_id, sections);
    sessionStorage.setItem("crm_session_id", proposal.session_id);
    router.push("/update-crm/processing");
  };

  if (!proposal) return <div className="flex-1 flex items-center justify-center text-[#888]">Loading...</div>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title="Update CRM" />

      {/* Meeting header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#F9F9F9]">
        <Calendar className="w-4 h-4 text-[#888]" />
        <span className="text-[14px] font-semibold">{proposal.recording_title}</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[#F9F9F9] border-b border-[#EBEBEB]">
          <span className="flex-1 text-[12px] font-semibold text-[#888] uppercase">Field</span>
          <span className="flex-1 text-[12px] font-semibold text-[#888] uppercase">Old</span>
          <span className="flex-1 text-[12px] font-semibold text-[#888] uppercase">New</span>
        </div>

        <div className="bg-white">
          {sections.map((section, si) => (
            <div key={section.category}>
              <div className="px-4 py-2.5 bg-[#F9F9F9]">
                <span className="text-[13px] font-semibold text-[#888]">{section.category}</span>
              </div>
              {section.fields.map((field, fi) => (
                <div key={fi} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#EBEBEB]">
                  <span className="flex-1 text-[13px]">{field.field}</span>
                  <span className="flex-1 text-[13px] text-[#A3A3A3]">{field.old_value}</span>
                  <input
                    className="flex-1 text-[13px] font-medium text-[#22C55E] bg-transparent outline-none"
                    value={field.new_value}
                    onChange={(e) => updateField(si, fi, e.target.value)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="px-6 pt-4 pb-8 bg-white shrink-0">
        <button
          onClick={handleSave}
          className="w-full h-12 bg-black text-white rounded-xl text-[15px] font-medium"
        >
          Save & Update CRM
        </button>
      </div>
    </div>
  );
}
