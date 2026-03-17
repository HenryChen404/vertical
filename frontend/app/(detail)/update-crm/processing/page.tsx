"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { Bot, Loader, Mic, Send } from "lucide-react";
import { api } from "@/lib/api";

export default function UpdateCrmProcessingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentItem, setCurrentItem] = useState("Q1 Enterprise Deal");
  const [completed, setCompleted] = useState(0);

  const items = [
    "Q1 Enterprise Deal",
    "TechStart Account",
    "Mike Johnson Contact",
  ];
  const total = items.length;

  useEffect(() => {
    // Fire the apply API call
    const sessionId = sessionStorage.getItem("crm_session_id");
    if (sessionId) {
      api.applyChanges(sessionId).catch(console.error);
    }

    // Animate progress
    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step >= items.length) {
        setProgress(100);
        setCompleted(items.length);
        setCurrentItem(items[items.length - 1]);
        clearInterval(timer);
        setTimeout(() => router.push("/update-crm/success"), 800);
      } else {
        setProgress(Math.round((step / items.length) * 100));
        setCompleted(step);
        setCurrentItem(items[step]);
      }
    }, 700);
    return () => clearInterval(timer);
  }, [router]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div className="flex-1 px-4 py-4">
        <div className="flex items-start gap-2">
          {/* Blue AI avatar with loader */}
          <div className="w-8 h-8 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0">
            <Loader className="w-[18px] h-[18px] text-white animate-spin" />
          </div>

          {/* Processing card */}
          <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
            {/* Title with loader */}
            <div className="flex items-center gap-2">
              <Loader className="w-[18px] h-[18px] text-[var(--accent-blue)] animate-spin" />
              <span className="text-[16px] font-semibold text-[var(--text-black)]">
                Updating CRM...
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-[var(--bg-page)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Progress info */}
            <div className="flex items-center justify-between">
              <span className="text-[14px] text-[var(--text-gray)]">
                {currentItem}
              </span>
              <span className="text-[14px] font-medium text-[var(--text-black)]">
                {completed}/{total}
              </span>
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
