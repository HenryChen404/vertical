"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { ProposedChange } from "@/lib/types";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function UpdateCrmEditPage() {
  const router = useRouter();
  const [changes, setChanges] = useState<ProposedChange[]>([]);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    if (!wfId) return;
    setWorkflowId(wfId);

    api.getWorkflow(wfId).then((wf) => {
      const proposed = wf.extractions?.proposed_changes || [];
      setChanges(proposed);
      // Auto-expand all
      setExpandedIds(new Set(proposed.map((c) => c.id)));
    }).catch(console.error);
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateFieldValue = (changeIdx: number, fieldIdx: number, newValue: string) => {
    setChanges((prev) => {
      const next = [...prev];
      next[changeIdx] = {
        ...next[changeIdx],
        changes: next[changeIdx].changes.map((f, i) =>
          i === fieldIdx ? { ...f, new: newValue } : f
        ),
      };
      return next;
    });
  };

  const handleSave = async () => {
    if (!workflowId || saving) return;
    setSaving(true);
    try {
      await api.updateProposedChanges(workflowId, changes);
      router.push("/update-crm/processing");
    } catch (e) {
      console.error("Save failed:", e);
      setSaving(false);
    }
  };

  if (changes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[var(--text-gray)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      <BackHeader title="Edit Changes" />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {changes.map((change, changeIdx) => {
          const isExpanded = expandedIds.has(change.id);
          return (
            <div
              key={change.id}
              className="bg-white rounded-xl border border-[#E8E8E8] overflow-hidden"
            >
              {/* Section header */}
              <button
                onClick={() => toggleExpand(change.id)}
                className="flex items-center gap-2 w-full px-4 py-3 text-left bg-[#F5F5F5]"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--text-gray)] shrink-0" />
                )}
                <span className="text-[15px] font-semibold text-[var(--text-black)]">
                  {change.action === "create" ? `New ${change.object_type}` : change.object_type}
                </span>
                {change.object_name && (
                  <span className="text-[13px] text-[var(--text-gray)]">
                    {change.object_name}
                  </span>
                )}
              </button>

              {/* Editable fields */}
              {isExpanded && (
                <div className="divide-y divide-[var(--border-line)]">
                  {change.changes.filter((d) => !/Id$/.test(d.field)).map((diff, fieldIdx) => (
                    <div key={fieldIdx} className="px-4 py-3 space-y-2">
                      {/* Field label */}
                      <p className="text-[13px] font-medium text-[var(--text-gray)]">
                        {diff.label}
                      </p>

                      {/* Current value */}
                      {diff.old != null && diff.old !== "" && (
                        <p className="text-[13px] text-[var(--text-gray)] line-through">
                          {diff.old}
                        </p>
                      )}

                      {/* Editable new value */}
                      {/date/i.test(diff.label) || /date/i.test(diff.field) ? (
                        <input
                          type="date"
                          className="w-full bg-[#F5F5F5] rounded-lg px-3 py-2.5 text-[14px] text-[var(--text-black)] outline-none focus:ring-1 focus:ring-[#CCC] transition-shadow cursor-pointer [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                          value={diff.new}
                          onChange={(e) => updateFieldValue(changeIdx, fieldIdx, e.target.value)}
                        />
                      ) : (
                        <AutoResizeTextarea
                          value={diff.new}
                          onChange={(val) => updateFieldValue(changeIdx, fieldIdx, val)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Save button */}
      <div className="px-4 pt-3 pb-8 bg-[var(--bg-page)] shrink-0">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full h-12 bg-black text-white rounded-xl text-[15px] font-semibold disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save & Push"}
        </button>
      </div>
    </div>
  );
}

// --- Auto-resize textarea ---

function AutoResizeTextarea({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  return (
    <textarea
      ref={ref}
      className="w-full bg-[#F5F5F5] rounded-lg px-3 py-2.5 text-[14px] leading-relaxed text-[var(--text-black)] outline-none resize-none focus:ring-1 focus:ring-[#CCC] transition-shadow overflow-hidden"
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
    />
  );
}
