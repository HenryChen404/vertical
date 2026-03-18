"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import type { CrmChangeSection } from "@/lib/types";
import { api } from "@/lib/api";

export default function UpdateCrmEditPage() {
  const router = useRouter();
  const [sections, setSections] = useState<CrmChangeSection[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    setWorkflowId(wfId);

    const data = sessionStorage.getItem("crm_sections");
    if (data) {
      setSections(JSON.parse(data));
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
    if (!workflowId || saving) return;
    setSaving(true);

    try {
      // Rebuild extractions from sections and push via workflow API
      const wf = await api.getWorkflow(workflowId);
      const extractions = { ...(wf.extractions || {}) };

      // Map section categories back to dimension keys
      const labelToKey: Record<string, string> = {
        Opportunity: "opportunity",
        Contact: "contact",
        Account: "account",
        "Event Summary": "event_summary",
      };

      for (const section of sections) {
        const dim = labelToKey[section.category] || section.category.toLowerCase();
        if (extractions[dim]?.data) {
          for (const field of section.fields) {
            (extractions[dim].data as Record<string, unknown>)[field.field] = field.new_value;
          }
        }
      }

      await api.updateExtractions(workflowId, extractions);
      router.push("/update-crm/processing");
    } catch (e) {
      console.error("Save failed:", e);
      setSaving(false);
    }
  };

  if (sections.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-gray)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white rounded-xl mx-0">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-[var(--bg-page)] rounded-t-xl">
          <span className="w-[65px] shrink-0 text-[12px] font-semibold text-[var(--text-gray)]">Field</span>
          <span className="w-[80px] shrink-0 text-[12px] font-semibold text-[var(--text-gray)]">Old Value</span>
          <span className="flex-1 text-[12px] font-semibold text-[var(--text-gray)]">New Value</span>
        </div>

        {sections.map((section, si) => (
          <div key={section.category}>
            <div className="px-4 py-2.5 bg-[var(--bg-page)]">
              <span className="text-[12px] font-semibold text-[var(--text-gray)] tracking-wider">
                {section.category}
              </span>
            </div>
            {section.fields.map((field, fi) => (
              <div key={fi} className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-line)]">
                <span className="w-[65px] shrink-0 text-[14px] font-medium text-[var(--text-black)]">
                  {field.field}
                </span>
                <span className="w-[80px] shrink-0 text-[14px] text-[var(--text-gray)]">
                  {field.old_value || "—"}
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
          disabled={saving}
          className="w-full h-12 bg-black text-white rounded-xl text-[16px] font-semibold disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
