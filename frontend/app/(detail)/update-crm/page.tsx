"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { UnsyncedRecording } from "@/lib/types";
import { Check, ChevronDown, Building, Briefcase } from "lucide-react";

export default function UpdateCrmSelectPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<UnsyncedRecording[]>([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api.getUnsyncedRecordings().then(setRecordings).catch(console.error);
  }, []);

  const toggle = (id: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const selectedIds = recordings.filter((r) => r.selected).map((r) => r.id);
  const visible = showAll ? recordings : recordings.slice(0, 2);
  const hiddenCount = recordings.length - 2;

  const [creating, setCreating] = useState(false);

  const handleContinue = async () => {
    if (selectedIds.length === 0 || creating) return;
    setCreating(true);
    try {
      const workflow = await api.createWorkflow(selectedIds);
      sessionStorage.setItem("crm_workflow_id", workflow.id);
      router.push("/update-crm/review");
    } catch (e) {
      console.error("Failed to create workflow:", e);
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      <div className="flex-1 overflow-y-auto px-6 pt-4">
        <p className="text-[14px] font-semibold text-[var(--text-gray)] mb-3">
          Today&apos;s Recordings
        </p>

        <div className="bg-white rounded-xl overflow-hidden">
          {visible.map((rec, i) => (
            <div key={rec.id}>
              {i > 0 && <div className="h-px bg-[var(--border-line)]" />}
              <button
                onClick={() => toggle(rec.id)}
                className="w-full flex items-start gap-3 p-4 text-left"
              >
                {/* Checkbox */}
                <div
                  className={`w-[22px] h-[22px] rounded-[4px] flex items-center justify-center shrink-0 mt-0.5 ${
                    rec.selected
                      ? "bg-black"
                      : "border-[1.5px] border-[#D0D0D0]"
                  }`}
                >
                  {rec.selected && (
                    <Check className="w-[14px] h-[14px] text-white" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[15px] font-medium text-[var(--text-black)] leading-tight">
                    {rec.title}
                  </p>
                  <p className="text-[13px] text-[var(--text-gray)]">
                    {rec.date} · {rec.duration} · Unsynced
                  </p>

                  {/* CRM Tags */}
                  {rec.crm_tags && rec.crm_tags.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      {rec.crm_tags.map((tag) => (
                        <span
                          key={tag.label}
                          className="flex items-center gap-1"
                        >
                          {tag.type === "account" ? (
                            <Building className="w-3 h-3 text-[var(--accent-green)]" />
                          ) : (
                            <Briefcase className="w-3 h-3 text-[#E65100]" />
                          )}
                          <span
                            className={`text-[12px] font-medium ${
                              tag.type === "account"
                                ? "text-[var(--accent-green)]"
                                : "text-[#E65100]"
                            }`}
                          >
                            {tag.label}
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>

        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full flex items-center justify-center gap-2 bg-white rounded-xl py-3 mt-3"
          >
            <ChevronDown className="w-[18px] h-[18px] text-[var(--text-gray)]" />
            <span className="text-[14px] font-medium text-[var(--text-gray)]">
              Show All Unsynced ({recordings.length})
            </span>
          </button>
        )}
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pt-4 pb-8 bg-[var(--bg-page)] shrink-0">
        <button
          onClick={handleContinue}
          disabled={selectedIds.length === 0 || creating}
          className="w-full py-4 bg-black text-white rounded-[14px] text-[17px] font-semibold disabled:opacity-40"
        >
          {creating ? "Creating..." : `Continue (${selectedIds.length} selected)`}
        </button>
      </div>
    </div>
  );
}
