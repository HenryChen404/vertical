"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { UnsyncedRecording } from "@/lib/types";
import { Check, ChevronDown } from "lucide-react";

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

  const handleContinue = () => {
    if (selectedIds.length === 0) return;
    sessionStorage.setItem("crm_selected_ids", JSON.stringify(selectedIds));
    router.push("/update-crm/review");
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title="Update CRM" />

      <div className="flex-1 overflow-y-auto px-6 pt-4">
        <p className="text-[14px] font-semibold text-[#888] mb-3">Today&apos;s Recordings</p>

        <div className="bg-white rounded-xl overflow-hidden">
          {visible.map((rec, i) => (
            <div key={rec.id}>
              {i > 0 && <div className="h-px bg-[#EBEBEB]" />}
              <button onClick={() => toggle(rec.id)} className="w-full flex items-center gap-3 p-4 text-left">
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${rec.selected ? "bg-black border-black" : "border-[#D1D5DB]"}`}>
                  {rec.selected && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium truncate">{rec.title}</p>
                  <p className="text-[13px] text-[#888]">{rec.date} · {rec.duration}</p>
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
            <ChevronDown className="w-[18px] h-[18px] text-[#888]" />
            <span className="text-[14px] font-medium text-[#888]">
              Show All Unsynced ({recordings.length})
            </span>
          </button>
        )}
      </div>

      <div className="px-6 pt-4 pb-8 shrink-0">
        <button
          onClick={handleContinue}
          disabled={selectedIds.length === 0}
          className="w-full h-12 bg-black text-white rounded-xl text-[15px] font-medium disabled:opacity-40"
        >
          Continue with {selectedIds.length} Recording{selectedIds.length !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}
