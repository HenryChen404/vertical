"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { Loader, Mic, Send, Check } from "lucide-react";
import { api } from "@/lib/api";
import type { WorkflowStreamEvent } from "@/lib/types";

const WF = { PUSHING: 4, DONE: 5, FAILED: 6 };

export default function UpdateCrmProcessingPage() {
  const router = useRouter();
  const [message, setMessage] = useState("Pushing to CRM...");
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const workflowId = sessionStorage.getItem("crm_workflow_id");
    if (!workflowId) return;

    // Trigger the confirm/push
    api.confirmWorkflow(workflowId).catch(console.error);

    // Poll via SSE
    const es = api.streamWorkflow(workflowId);

    es.onmessage = (event) => {
      try {
        const data: WorkflowStreamEvent = JSON.parse(event.data);
        if (data.message) setMessage(data.message);

        if (data.workflow_state === WF.DONE) {
          setDone(true);
          es.close();
          setTimeout(() => router.push("/update-crm/success"), 1000);
        } else if (data.workflow_state === WF.FAILED) {
          setFailed(true);
          setMessage("Push failed. Please try again.");
          es.close();
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    es.onerror = () => es.close();
    return () => es.close();
  }, [router]);

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      <div className="flex-1 px-4 py-4">
        <div className="flex items-start gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            done ? "bg-[var(--accent-green)]" : failed ? "bg-[var(--accent-red)]" : "bg-[var(--accent-blue)]"
          }`}>
            {done ? (
              <Check className="w-[18px] h-[18px] text-white" />
            ) : (
              <Loader className="w-[18px] h-[18px] text-white animate-spin" />
            )}
          </div>

          <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              {!done && !failed && (
                <Loader className="w-[18px] h-[18px] text-[var(--accent-blue)] animate-spin" />
              )}
              <span className={`text-[16px] font-semibold ${
                done ? "text-[var(--accent-green)]" : "text-[var(--text-black)]"
              }`}>
                {message}
              </span>
            </div>

            {!done && !failed && (
              <div className="w-full h-2 bg-[var(--bg-page)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--accent-blue)] rounded-full animate-pulse w-2/3" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Input area (disabled) */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <div className="flex-1 h-11 bg-[var(--bg-page)] rounded-full px-4 flex items-center">
          <span className="text-[14px] text-[var(--text-gray)]">Type a message...</span>
        </div>
        <button className="w-11 h-11 rounded-full bg-[var(--bg-page)] flex items-center justify-center shrink-0">
          <Mic className="w-5 h-5 text-[var(--text-black)]" />
        </button>
        <button className="w-11 h-11 rounded-full bg-[var(--accent-blue)] flex items-center justify-center shrink-0 opacity-50">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
