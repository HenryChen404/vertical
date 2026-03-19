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
      const proposed = wf.extractions?.proposed_changes || [];

      // Group approved changes by object_type + action
      const seen = new Set<string>();
      for (const change of proposed) {
        if (!change.approved) continue;
        const key = `${change.action}:${change.object_type}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (change.action === "create") {
          results.push(`${change.object_type} created`);
        } else {
          results.push(`${change.object_type} updated`);
        }
      }

      setItems(results.length > 0 ? results : ["CRM updated successfully"]);

      sessionStorage.removeItem("crm_workflow_id");
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
      <div className="flex items-center gap-3 px-4 pt-4 pb-8 bg-white shrink-0 border-t border-[#EBEBEB]">
        <div className="flex-1 flex items-center h-11 bg-[#F0F0F0] rounded-full px-4">
          <span className="text-[14px] text-[var(--text-gray)]">Type a message...</span>
          <button className="shrink-0 ml-auto">
            <Mic className="w-5 h-5 text-[var(--text-gray)]" />
          </button>
        </div>
        <button className="w-11 h-11 rounded-full bg-black flex items-center justify-center shrink-0 opacity-50">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
