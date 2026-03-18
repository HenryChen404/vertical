"use client";

import { useEffect, useState } from "react";
import { BackHeader } from "@/components/layout/back-header";
import { Check, Mic, Send } from "lucide-react";
import { api } from "@/lib/api";

export default function UpdateCrmSuccessPage() {
  const [items, setItems] = useState<string[]>([]);

  useEffect(() => {
    const workflowId = sessionStorage.getItem("crm_workflow_id");
    if (!workflowId) return;

    api.getWorkflow(workflowId).then((wf) => {
      const results: string[] = [];
      const extractions = wf.extractions || {};

      if (extractions.opportunity?.status === "completed") results.push("Opportunity updated");
      if (extractions.account?.status === "completed") results.push("Account synced");
      if (extractions.contact?.status === "completed") results.push("Contacts updated");
      if (extractions.event_summary?.status === "completed") results.push("Event summary saved");

      setItems(results.length > 0 ? results : ["CRM updated successfully"]);

      // Mark recordings as synced
      sessionStorage.removeItem("crm_workflow_id");
      sessionStorage.removeItem("crm_sections");
    }).catch(console.error);
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Update CRM" />

      <div className="flex-1 px-4 py-4">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--accent-green)] flex items-center justify-center shrink-0">
            <Check className="w-[18px] h-[18px] text-white" />
          </div>

          <div className="flex-1 bg-white rounded-xl p-4 space-y-3">
            <span className="text-[16px] font-bold text-[var(--accent-green)]">
              Updates Complete
            </span>

            <div className="space-y-2">
              {items.map((item, i) => (
                <p key={i} className="text-[14px] text-[#666]">
                  &bull; {item}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <div className="flex-1 h-11 bg-[var(--bg-page)] rounded-full px-4 flex items-center">
          <span className="text-[14px] text-[var(--text-gray)]">Type a message...</span>
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
