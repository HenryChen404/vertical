"use client";

import { BackHeader } from "@/components/layout/back-header";
import { Check, Mic, Send } from "lucide-react";

export default function UpdateCrmSuccessPage() {
  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div className="flex-1 px-4 py-4">
        <div className="flex items-start gap-2">
          {/* Green avatar with check */}
          <div className="w-8 h-8 rounded-full bg-[var(--accent-green)] flex items-center justify-center shrink-0">
            <Check className="w-[18px] h-[18px] text-white" />
          </div>

          {/* Success card */}
          <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
            <span className="text-[16px] font-bold text-[var(--accent-green)]">
              Updates Complete
            </span>

            <div className="space-y-2">
              <p className="text-[14px] text-[#666]">
                &bull; 3 opportunities updated
              </p>
              <p className="text-[14px] text-[#666]">
                &bull; 2 accounts synced
              </p>
              <p className="text-[14px] text-[#666]">
                &bull; 1 contact added
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <div className="flex-1 h-11 bg-[var(--bg-page)] rounded-full px-4 flex items-center">
          <span className="text-[14px] text-[var(--text-gray)]">
            Type a message...
          </span>
        </div>
        <button className="w-11 h-11 rounded-full bg-[var(--bg-page)] flex items-center justify-center shrink-0">
          <Mic className="w-5 h-5 text-[var(--text-black)]" />
        </button>
        <button className="w-11 h-11 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
