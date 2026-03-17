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

  const updateField = (
    sectionIdx: number,
    fieldIdx: number,
    newValue: string
  ) => {
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

  if (!proposal)
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-gray)]">
        Loading...
      </div>
    );

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Meeting header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[var(--bg-page)]">
        <Calendar className="w-4 h-4 text-[var(--text-gray)]" />
        <span className="text-[14px] font-semibold text-[var(--text-black)]">
          {proposal.recording_title}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl mx-0">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-page)] rounded-t-xl">
          <span className="w-[65px] shrink-0 text-[12px] font-semibold text-[var(--text-gray)]">
            Field
          </span>
          <span className="w-[80px] shrink-0 text-[12px] font-semibold text-[var(--text-gray)]">
            Old Value
          </span>
          <span className="flex-1 text-[12px] font-semibold text-[var(--text-gray)]">
            New Value
          </span>
        </div>

        {sections.map((section, si) => (
          <div key={section.category}>
            {/* Category header */}
            <div className="px-4 py-2.5 bg-[var(--bg-page)]">
              <span className="text-[12px] font-semibold text-[var(--text-gray)] tracking-wider">
                {section.category}
              </span>
            </div>

            {/* Rows */}
            {section.fields.map((field, fi) => (
              <div
                key={fi}
                className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-line)]"
              >
                <span className="w-[65px] shrink-0 text-[14px] font-medium text-[var(--text-black)]">
                  {field.field}
                </span>
                <span className="w-[80px] shrink-0 text-[14px] text-[var(--text-gray)]">
                  {field.old_value}
                </span>
                <div className="flex-1">
                  <input
                    className="w-full h-9 bg-[var(--bg-page)] rounded-lg px-3 text-[14px] font-medium text-[var(--accent-green)] outline-none"
                    value={field.new_value}
                    onChange={(e) => updateField(si, fi, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Save button */}
      <div className="px-6 pt-4 pb-8 bg-white shrink-0">
        <button
          onClick={handleSave}
          className="w-full h-12 bg-black text-white rounded-xl text-[16px] font-semibold"
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
