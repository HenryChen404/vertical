"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { UnsyncedRecording } from "@/lib/types";
import { X, Check } from "lucide-react";

export default function UpdateCrmSelectPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<UnsyncedRecording[]>([]);
  const [creating, setCreating] = useState(false);
  const [showDontSyncDialog, setShowDontSyncDialog] = useState(false);

  useEffect(() => {
    api.getUnsyncedRecordings().then(setRecordings).catch(console.error);
  }, []);

  const toggle = (id: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const allSelected =
    recordings.length > 0 && recordings.every((r) => r.selected);

  const toggleAll = () => {
    const newVal = !allSelected;
    setRecordings((prev) => prev.map((r) => ({ ...r, selected: newVal })));
  };

  const selectedIds = recordings.filter((r) => r.selected).map((r) => r.id);
  const selectedCount = selectedIds.length;

  const handleContinue = async () => {
    if (selectedCount === 0 || creating) return;
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

  const handleRemove = () => {
    setShowDontSyncDialog(false);
    router.back();
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center -ml-2"
        >
          <X className="w-5 h-5 text-black" />
        </button>
        <h1 className="text-[17px] font-semibold text-black">
          Select Recordings
        </h1>
        <button
          onClick={toggleAll}
          className="text-[15px] font-medium text-[#1A89FF]"
        >
          {allSelected ? "Unselect all" : "Select all"}
        </button>
      </div>

      {/* Subtitle */}
      <p className="text-[14px] text-[#888] px-4 pb-3">
        {recordings.length} Unsynced Recording{recordings.length !== 1 && "s"}
      </p>

      {/* Recording list */}
      <div className="flex-1 overflow-y-auto px-4">
        {recordings.map((rec, i) => (
          <div key={rec.id}>
            {i > 0 && <div className="h-px bg-[#F0F0F0]" />}
            <button
              onClick={() => toggle(rec.id)}
              className="w-full flex items-center gap-3 py-4 text-left"
            >
              {/* Info */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-[15px] font-medium text-black leading-snug line-clamp-2">
                  {rec.title}
                </p>
                <p className="text-[13px] text-[#888]">
                  {rec.date} | {rec.duration}
                </p>
                {rec.crm_tags && rec.crm_tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {rec.crm_tags.map((tag) => (
                      <span
                        key={tag.label}
                        className="inline-block px-2.5 py-0.5 bg-[#F0F0F0] rounded-full text-[12px] text-[#666]"
                      >
                        {tag.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Circle checkbox */}
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                  rec.selected
                    ? "bg-black"
                    : "border-[1.5px] border-[#D0D0D0]"
                }`}
              >
                {rec.selected && (
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                )}
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* Bottom buttons — only show when something is selected */}
      {selectedCount > 0 && (
        <div className="px-4 pt-3 pb-8 shrink-0">
          <button
            onClick={handleContinue}
            disabled={creating}
            className="w-full py-[14px] bg-black text-white rounded-xl text-[16px] font-semibold disabled:opacity-40"
          >
            {creating ? "Creating..." : `Continue (${selectedCount})`}
          </button>
          <button
            onClick={() => setShowDontSyncDialog(true)}
            className="w-full py-3 text-[14px] text-[#888] font-medium text-center"
          >
            Don&apos;t sync
          </button>
        </div>
      )}

      {/* "Don't sync" confirmation dialog */}
      {showDontSyncDialog && (
        <div className="absolute inset-0 z-50 flex items-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowDontSyncDialog(false)}
          />
          {/* Dialog */}
          <div className="relative w-full bg-white rounded-t-2xl px-5 pt-5 pb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[17px] font-semibold text-black">
                Remove from CRM updates
              </h2>
              <button
                onClick={() => setShowDontSyncDialog(false)}
                className="w-8 h-8 flex items-center justify-center -mr-1"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>
            <p className="text-[14px] text-[#666] leading-relaxed mb-5">
              Selected recordings will be removed from CRM updates.{" "}
              <span className="font-semibold text-black">
                This action cannot be undone.
              </span>{" "}
              They will remain saved in your library.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDontSyncDialog(false)}
                className="flex-1 py-[12px] border border-[#D0D0D0] rounded-xl text-[15px] font-medium text-black"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                className="flex-1 py-[12px] bg-black text-white rounded-xl text-[15px] font-medium"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
