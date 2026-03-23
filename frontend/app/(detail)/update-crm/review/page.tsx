"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import type {
  WorkflowMessage,
  WorkflowStreamEvent,
  ProposedChange,
  RecordingExtraction,
  FieldDiff,
} from "@/lib/types";
import {

  Send,
  ArrowRight,

  FileAudio,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronUp,

  X,
  Check,
  Loader2,
  Briefcase,
  Building2,
  User,
} from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────

const WF = {
  CREATED: 0,
  TRANSCRIBING: 1,
  ANALYZING: 2,
  REVIEW: 3,
  PUSHING: 4,
  DONE: 5,
  FAILED: 6,
};

const SSE_LABELS: Record<number, string> = {
  [WF.CREATED]: "Preparing...",
  [WF.TRANSCRIBING]: "Transcribing recordings...",
  [WF.ANALYZING]: "Analyzing meeting data...",
};

// ─── PLAUD Avatar ────────────────────────────────────────────────────────────

function PlaudAvatar({ size = 28 }: { size?: number }) {
  return (
    <img
      src="/icons/plaud-ai.svg"
      alt="PLAUD"
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

// ─── Section icon by object type ─────────────────────────────────────────────

function ObjectIcon({ type }: { type: string }) {
  switch (type) {
    case "Opportunity":
      return <Briefcase className="w-3.5 h-3.5" />;
    case "Account":
      return <Building2 className="w-3.5 h-3.5" />;
    case "Contact":
      return <User className="w-3.5 h-3.5" />;
    default:
      return <Briefcase className="w-3.5 h-3.5" />;
  }
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ConfirmUpdatesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<WorkflowMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowState, setWorkflowState] = useState(WF.CREATED);
  const [sseMessage, setSseMessage] = useState("");
  const [sseProgress, setSseProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState(0);

  // Paginator state
  const [currentRecordingIdx, setCurrentRecordingIdx] = useState(0);
  const [skippedRecordings, setSkippedRecordings] = useState<Set<number>>(
    new Set()
  );
  const [appliedRecordings, setAppliedRecordings] = useState<Set<number>>(
    new Set()
  );

  // Dialogs
  const [showSkipDialog, setShowSkipDialog] = useState(false);
  const [showApplyAllDialog, setShowApplyAllDialog] = useState(false);

  // Edit sheet
  const [editSection, setEditSection] = useState<{
    objectType: string;
    changes: ProposedChange[];
  } | null>(null);
  const [editValues, setEditValues] = useState<
    Map<string, Map<number, string>>
  >(new Map());

  // Recently updated fields (for green highlight)
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(
    new Set()
  );

  // Card history: each entry is { userMessage, sectionsByType } for grayed-out old cards
  const [cardHistory, setCardHistory] = useState<
    { userMessage: string; sectionsByType: Map<string, ProposedChange[]> }[]
  >([]);

  // Completion summary
  const [completionSummary, setCompletionSummary] = useState<string[] | null>(
    null
  );

  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformTimerRef = useRef<number | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  // ─── Derived data ────────────────────────────────────────────────────────

  // Latest flat proposed_changes (for backward compat and change diffing)
  const latestChanges = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const pc = messages[i].content.proposed_changes;
      if (pc && pc.length > 0) return pc;
    }
    return [] as ProposedChange[];
  }, [messages]);

  // Per-recording extractions from SSE/workflow data
  // Stored as ref-stable state updated when SSE sends recordings data
  const [perRecordingExtractions, setPerRecordingExtractions] = useState<RecordingExtraction[]>([]);

  // Build recording groups: prefer per-recording extractions, fall back to old format
  const recordingGroups = useMemo(() => {
    // New format: per-recording extractions available
    if (perRecordingExtractions.length > 0) {
      return perRecordingExtractions.map((rec) => ({
        recording_id: rec.recording_id,
        name: rec.name,
        changes: rec.proposed_changes,
      }));
    }

    // Old format: flat proposed_changes + recording names from messages
    if (latestChanges.length === 0) return [];

    // Try to get recording names from messages (old format)
    let recordingNames: string[] = [];
    for (const m of messages) {
      if (m.content.recordings && m.content.recordings.length > 0) {
        recordingNames = m.content.recordings;
        break;
      }
    }

    if (recordingNames.length > 0) {
      return recordingNames.map((name) => ({
        recording_id: undefined as string | undefined,
        name,
        changes: latestChanges,
      }));
    }

    return [{ recording_id: undefined as string | undefined, name: "Recording", changes: latestChanges }];
  }, [perRecordingExtractions, latestChanges, messages]);

  const totalRecordings = recordingGroups.length;
  const currentGroup = recordingGroups[currentRecordingIdx] || null;

  // Group current recording's changes by object_type
  const sectionsByType = useMemo(() => {
    if (!currentGroup) return new Map<string, ProposedChange[]>();
    const map = new Map<string, ProposedChange[]>();
    for (const c of currentGroup.changes) {
      const existing = map.get(c.object_type) || [];
      existing.push(c);
      map.set(c.object_type, existing);
    }
    return map;
  }, [currentGroup]);

  // Active (unprocessed) recording indices
  const activeIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < totalRecordings; i++) {
      if (!appliedRecordings.has(i) && !skippedRecordings.has(i)) {
        indices.push(i);
      }
    }
    return indices;
  }, [totalRecordings, appliedRecordings, skippedRecordings]);

  const remainingCount = activeIndices.length;

  // Position of current recording within active list (for paginator display)
  const activePosition = activeIndices.indexOf(currentRecordingIdx);

  const allDone =
    workflowState === WF.DONE ||
    (totalRecordings > 0 && remainingCount === 0);

  // ─── SSE connection ──────────────────────────────────────────────────────

  useEffect(() => {
    const wfId = sessionStorage.getItem("crm_workflow_id");
    if (!wfId) return;
    setWorkflowId(wfId);

    api.getWorkflowMessages(wfId).then(setMessages).catch(console.error);

    // Hydrate per-recording extractions from workflow on initial load
    api.getWorkflow(wfId).then((wf) => {
      if (wf.extractions?.recordings && wf.extractions.recordings.length > 0) {
        setPerRecordingExtractions(wf.extractions.recordings);
      }
    }).catch(console.error);

    const es = api.streamWorkflow(wfId);
    es.onmessage = (event) => {
      try {
        const data: WorkflowStreamEvent = JSON.parse(event.data);
        setWorkflowState(data.workflow_state);

        if (data.workflow_state < WF.REVIEW) {
          setSseMessage(
            data.message || SSE_LABELS[data.workflow_state] || "Processing..."
          );
          if (data.analysis_progress) {
            setSseProgress({
              completed: data.analysis_progress.completed,
              total: data.analysis_progress.total,
            });
          } else if (data.workflow_state === WF.ANALYZING) {
            setSseProgress({ completed: 0, total: 0 });
          } else if (data.tasks_total > 0) {
            setSseProgress({
              completed: data.tasks_completed,
              total: data.tasks_total,
            });
          }
        } else if (data.workflow_state === WF.PUSHING) {
          // Update push progress from SSE
          const pp = (data as any).push_progress;
          if (pp && pp.total > 0) {
            setPushProgress(pp.percent ?? Math.round((pp.completed / pp.total) * 100));
          }
        } else {
          setSseMessage("");
          setSseProgress(null);
          api.getWorkflowMessages(wfId).then(setMessages);
          // Update per-recording extractions if available from SSE
          if (data.extractions?.recordings && data.extractions.recordings.length > 0) {
            setPerRecordingExtractions(data.extractions.recordings);
          }

          if (data.workflow_state === WF.DONE) {
            // Apply all completed — mark everything applied
            setPushProgress(100);
            setAppliedRecordings((prev) => {
              const all = new Set(prev);
              for (let i = 0; i < totalRecordings; i++) all.add(i);
              return all;
            });
            setTimeout(() => setIsPushing(false), 1500);
            es.close();
          } else if (data.workflow_state === WF.REVIEW && isPushing) {
            // Single recording push completed — back to REVIEW
            setPushProgress(100);
            setAppliedRecordings((prev) => new Set(prev).add(currentRecordingIdx));
            setTimeout(() => {
              setIsPushing(false);
              setPushProgress(0);
              setRecentlyUpdated(new Set());
              setCardHistory([]);
              // Advance to next unprocessed recording
              setCurrentRecordingIdx((currIdx) => {
                for (let i = 0; i < totalRecordings; i++) {
                  if (i !== currIdx && !appliedRecordings.has(i) && !skippedRecordings.has(i)) {
                    return i;
                  }
                }
                return currIdx;
              });
            }, 1500);
          } else if (data.workflow_state === WF.FAILED) {
            setIsPushing(false);
            es.close();
          }
        }
      } catch (e) {
        console.error("SSE parse error:", e);
      }
    };

    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sseMessage, isThinking, isPushing, allDone]);

  // ─── Handlers ────────────────────────────────────────────────────────────

  // Apply current recording only — fire and forget, SSE drives progress
  const handleApplyUpdates = () => {
    if (!workflowId || isPushing) return;
    setIsPushing(true);
    setPushProgress(0);
    // Fire and forget — SSE will track PUSHING state and progress
    api.confirmWorkflow(workflowId, currentGroup?.recording_id).catch((e) => {
      console.error("Push failed:", e);
      setIsPushing(false);
    });
  };

  // Apply all recordings at once — fire and forget
  const handleApplyAll = () => {
    setShowApplyAllDialog(false);
    if (!workflowId || isPushing) return;
    setIsPushing(true);
    setPushProgress(0);
    api.confirmWorkflow(workflowId).catch((e) => {
      console.error("Push all failed:", e);
      setIsPushing(false);
    });
  };

  const handleSkip = () => {
    setShowSkipDialog(false);
    const newSkipped = new Set(skippedRecordings);
    newSkipped.add(currentRecordingIdx);
    setSkippedRecordings(newSkipped);
    setRecentlyUpdated(new Set());
    setCardHistory([]);

    // Move to next unapplied recording using fresh state
    let nextIdx = -1;
    for (let i = 0; i < totalRecordings; i++) {
      if (!appliedRecordings.has(i) && !newSkipped.has(i)) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx >= 0) {
      setCurrentRecordingIdx(nextIdx);
    }
    // If no more remaining, allDone will trigger completion view
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || !workflowId) return;
    const text = inputText.trim();
    setInputText("");

    // Snapshot current card into history before updating
    setCardHistory((prev) => [
      ...prev,
      { userMessage: text, sectionsByType: new Map(sectionsByType) },
    ]);
    setRecentlyUpdated(new Set());

    const optimisticMsg: WorkflowMessage = {
      id: `temp-${Date.now()}`,
      workflow_id: workflowId,
      role: 0,
      content: { text },
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setIsThinking(true);

    try {
      const result = await api.chatWorkflow(workflowId, text, currentGroup?.recording_id);
      setIsThinking(false);

      if (result.should_push) {
        handleApplyUpdates();
        return;
      }

      const msgs = await api.getWorkflowMessages(workflowId);
      setMessages(msgs);

      // Update per-recording extractions if the response includes them
      if (result.extractions?.recordings && result.extractions.recordings.length > 0) {
        setPerRecordingExtractions(result.extractions.recordings);
      }

      // Mark only actually changed fields as recently updated
      // Compare against current recording's changes
      const newUpdated = new Set<string>();
      const oldChangesForComparison = currentGroup?.changes || latestChanges;

      // Determine the new changes to diff against
      let newChangesToDiff: ProposedChange[] = [];
      if (result.extractions?.recordings && currentGroup?.recording_id) {
        // New format: find the current recording in the response
        const updatedRec = result.extractions.recordings.find(
          (r) => r.recording_id === currentGroup.recording_id
        );
        if (updatedRec) {
          newChangesToDiff = updatedRec.proposed_changes;
        }
      } else if (result.extractions?.proposed_changes) {
        // Old format: flat proposed_changes
        newChangesToDiff = result.extractions.proposed_changes;
      }

      if (newChangesToDiff.length > 0) {
        const oldChangesMap = new Map<string, Map<string, string>>();
        for (const pc of oldChangesForComparison) {
          const fieldMap = new Map<string, string>();
          for (const fd of pc.changes) {
            fieldMap.set(fd.field, fd.new);
          }
          oldChangesMap.set(pc.id, fieldMap);
        }
        for (const pc of newChangesToDiff) {
          const oldFields = oldChangesMap.get(pc.id);
          for (const fd of pc.changes) {
            const oldVal = oldFields?.get(fd.field);
            if (oldVal !== undefined && oldVal !== fd.new) {
              newUpdated.add(`${pc.id}:${fd.field}`);
            }
          }
        }
      }
      setRecentlyUpdated(newUpdated);
    } catch (e) {
      console.error("Chat error:", e);
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          workflow_id: workflowId,
          role: 1,
          content: { text: "Something went wrong. Please try again." },
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const toggleListening = async () => {
    if (isListening) {
      recognitionRef.current?.stop();
      if (waveformTimerRef.current) {
        cancelAnimationFrame(waveformTimerRef.current);
        waveformTimerRef.current = null;
      }
      analyserRef.current = null;
      setIsListening(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      // Set up Web Audio analyser for real-time levels
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Sample audio level every ~80ms and append bars
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastTime = 0;
      const tick = (time: number) => {
        if (!analyserRef.current) return;
        if (time - lastTime >= 80) {
          lastTime = time;
          analyserRef.current.getByteFrequencyData(dataArray);
          const avg = dataArray.slice(0, 32).reduce((a, b) => a + b, 0) / 32;
          // Min 6px (silence visible), max 24px; boost sensitivity
          const normalized = Math.min(1, (avg / 180));
          const barH = Math.max(6, Math.round(normalized * 24));
          setWaveformBars((prev) => [...prev, barH]);
        }
        waveformTimerRef.current = requestAnimationFrame(tick);
      };
      waveformTimerRef.current = requestAnimationFrame(tick);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        setWaveformBars([]);
        setIsTranscribing(true);
        const audioBlob = new Blob(chunks, { type: mediaRecorder.mimeType });
        try {
          const text = await api.transcribeVoice(audioBlob);
          if (text) setInputText((prev) => (prev ? prev + " " + text : text));
        } catch (e) {
          console.error("Voice transcription failed:", e);
        } finally {
          setIsTranscribing(false);
        }
      };

      recognitionRef.current = mediaRecorder;
      mediaRecorder.start();
      setWaveformBars([]);
      setIsListening(true);
    } catch (e) {
      console.error("Mic access failed:", e);
    }
  };

  // Auto-scroll waveform to the right
  useEffect(() => {
    if (waveformRef.current) {
      waveformRef.current.scrollLeft = waveformRef.current.scrollWidth;
    }
  }, [waveformBars]);

  const handleSaveEdits = async () => {
    if (!editSection || !workflowId) return;

    // Use current recording's changes for the edit base
    const currentChanges = currentGroup?.changes || latestChanges;

    // Apply edited values to current recording's changes
    const updatedChanges = currentChanges.map((change) => {
      const changeEdits = editValues.get(change.id);
      if (!changeEdits) return change;
      return {
        ...change,
        changes: change.changes.map((fd, idx) => {
          const newVal = changeEdits.get(idx);
          return newVal !== undefined ? { ...fd, new: newVal } : fd;
        }),
      };
    });

    try {
      await api.updateProposedChanges(workflowId, updatedChanges);
      const msgs = await api.getWorkflowMessages(workflowId);
      setMessages(msgs);

      // Also update in-memory per-recording extractions if using new format
      if (perRecordingExtractions.length > 0 && currentGroup?.recording_id) {
        setPerRecordingExtractions((prev) =>
          prev.map((rec) =>
            rec.recording_id === currentGroup.recording_id
              ? { ...rec, proposed_changes: updatedChanges }
              : rec
          )
        );
      }
    } catch (e) {
      console.error("Save edits failed:", e);
    }

    setEditSection(null);
    setEditValues(new Map());
  };

  const isProcessing = workflowState < WF.REVIEW;

  // ─── Build completion summary ────────────────────────────────────────────

  // Build completion summary when all recordings are done
  useEffect(() => {
    if (!allDone || completionSummary) return;

    // If backend says DONE, fetch from workflow
    if (workflowState === WF.DONE && workflowId) {
      api
        .getWorkflow(workflowId)
        .then((wf) => {
          const results: string[] = [];
          let allProposed: ProposedChange[] = [];
          if (wf.extractions?.recordings && wf.extractions.recordings.length > 0) {
            for (const rec of wf.extractions.recordings) {
              allProposed = allProposed.concat(rec.proposed_changes);
            }
          } else {
            allProposed = wf.extractions?.proposed_changes || [];
          }

          const counts: Record<string, { updated: number; created: number }> = {};
          for (const change of allProposed) {
            if (!change.approved) continue;
            if (!counts[change.object_type])
              counts[change.object_type] = { updated: 0, created: 0 };
            if (change.action === "create") {
              counts[change.object_type].created++;
            } else {
              counts[change.object_type].updated++;
            }
          }

          for (const [type, c] of Object.entries(counts)) {
            if (c.updated > 0)
              results.push(
                `${c.updated} ${type.toLowerCase()}${c.updated > 1 ? "s" : ""} updated`
              );
            if (c.created > 0)
              results.push(
                `${c.created} ${type.toLowerCase()}${c.created > 1 ? "s" : ""} added`
              );
          }

          setCompletionSummary(
            results.length > 0 ? results : ["CRM updated successfully"]
          );
        })
        .catch(console.error);
    } else {
      // Frontend-driven allDone (all recordings individually applied/skipped)
      // Build summary from perRecordingExtractions
      const results: string[] = [];
      const counts: Record<string, { updated: number; created: number }> = {};

      for (const rec of perRecordingExtractions) {
        for (const change of rec.proposed_changes) {
          if (!change.approved) continue;
          if (!counts[change.object_type])
            counts[change.object_type] = { updated: 0, created: 0 };
          if (change.action === "create") {
            counts[change.object_type].created++;
          } else {
            counts[change.object_type].updated++;
          }
        }
      }

      for (const [type, c] of Object.entries(counts)) {
        if (c.updated > 0)
          results.push(
            `${c.updated} ${type.toLowerCase()}${c.updated > 1 ? "s" : ""} updated`
          );
        if (c.created > 0)
          results.push(
            `${c.created} ${type.toLowerCase()}${c.created > 1 ? "s" : ""} added`
          );
      }

      setCompletionSummary(
        results.length > 0 ? results : ["CRM updated successfully"]
      );
    }
  }, [allDone, workflowState, workflowId]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[var(--bg-page)]">
      {/* Header without border */}
      <div className="relative flex items-center h-11 px-6 shrink-0">
        <button onClick={() => router.back()} className="z-10">
          <img src="/icons/icon-chevron-left.svg" alt="Back" className="w-6 h-6" />
        </button>
        <span className="absolute inset-0 flex items-center justify-center text-[16px] font-semibold leading-6">
          Confirm updates
        </span>
      </div>

      {/* Chat / content area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Processing state */}
        {isProcessing && (
          <div className="flex items-start gap-2.5">
            <PlaudAvatar />
            <div className="flex-1 min-w-0">
              <ProcessingBubble
                message={
                  workflowState === WF.TRANSCRIBING &&
                  sseProgress &&
                  sseProgress.total > 0
                    ? `Transcribing recordings (${sseProgress.completed}/${sseProgress.total})...`
                    : sseMessage || SSE_LABELS[workflowState] || "Thinking..."
                }
                progress={
                  workflowState === WF.ANALYZING &&
                  sseProgress &&
                  sseProgress.total > 0
                    ? sseProgress
                    : undefined
                }
              />
            </div>
          </div>
        )}

        {/* === Review + Chat layout === */}
        {!isProcessing && currentGroup && !allDone && (() => {
          // Active review card (latest state)
          const activeCard = (
            <div className="space-y-3">
              <PlaudAvatar />
              {/* Progress / Applied / Updated indicator */}
              {isPushing && workflowState !== WF.DONE ? (
                <ProgressCard progress={Math.round(pushProgress)} />
              ) : isPushing && workflowState === WF.DONE ? (
                <div className="border-l-[3px] border-[#36D96C] pl-3 py-1">
                  <span className="text-[14px] font-normal leading-5 text-black">
                    Update applied
                  </span>
                </div>
              ) : recentlyUpdated.size > 0 ? (
                <div className="flex items-center gap-1.5">
                  <img src="/icons/icon-updated.svg" alt="" className="w-5 h-5" />
                  <span className="text-[14px] font-normal leading-5 text-[#36D96C]">Updated</span>
                </div>
              ) : null}
              <div className="bg-[#F2F2F2] rounded-[5px]">
                {totalRecordings > 0 && (
                  <RecordingPaginator
                    current={activePosition >= 0 ? activePosition : 0}
                    total={remainingCount}
                    remaining={remainingCount}
                    onPrev={() => {
                      if (activePosition > 0) {
                        setCurrentRecordingIdx(activeIndices[activePosition - 1]);
                      }
                    }}
                    onNext={() => {
                      if (activePosition < activeIndices.length - 1) {
                        setCurrentRecordingIdx(activeIndices[activePosition + 1]);
                      }
                    }}
                    onApplyAll={() => setShowApplyAllDialog(true)}
                  />
                )}
                <div className="bg-white rounded-[5px] p-4 space-y-5">
                  {currentGroup.name && (
                    <div className="flex items-center gap-2">
                      <FileAudio className="w-5 h-5 text-[#A3A3A3] shrink-0" />
                      <span className="text-[14px] text-[#A3A3A3] truncate">
                        {currentGroup.name}
                      </span>
                    </div>
                  )}
                  <ChangesCard
                    sectionsByType={sectionsByType}
                    recentlyUpdated={recentlyUpdated}
                    onEdit={(objectType, changes) =>
                      setEditSection({ objectType, changes })
                    }
                  />
                  {!isPushing && (
                    <div className="flex items-center justify-between pb-1">
                      <button
                        onClick={handleApplyUpdates}
                        className="h-8 bg-black text-white rounded-[5px] px-4 text-[14px] font-semibold"
                      >
                        Apply updates
                      </button>
                      <button
                        onClick={() => setShowSkipDialog(true)}
                        className="h-8 px-4 text-[14px] font-normal text-black"
                      >
                        Skip
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );

          // No history: just show the active card
          if (cardHistory.length === 0 && !isThinking) {
            return activeCard;
          }

          // Has history: grayed cards first (scrolled above) → messages → thinking → active card
          return (
            <>
              {/* All grayed-out old cards */}
              {cardHistory.map((entry, idx) => (
                <div key={`card-${idx}`} className="space-y-3 opacity-40 pointer-events-none">
                  <PlaudAvatar />
                  <div className="bg-[#F2F2F2] rounded-[5px]">
                    <div className="bg-white rounded-[5px] p-4">
                      <ChangesCard
                        sectionsByType={entry.sectionsByType}
                        recentlyUpdated={new Set()}
                        onEdit={() => {}}
                      />
                    </div>
                  </div>
                </div>
              ))}

              {/* All user messages */}
              {cardHistory.map((entry, idx) => (
                <div key={`msg-${idx}`} className="flex justify-end">
                  <p className="text-[14px] font-normal leading-5 bg-[#5C5C5C] text-white rounded-[5px] px-3 py-2 max-w-[280px]">
                    {entry.userMessage}
                  </p>
                </div>
              ))}

              {/* Thinking or latest active card */}
              {isThinking ? (
                <p className="text-[16px] leading-6 animate-shimmer-text"
                  style={{
                    backgroundImage: "linear-gradient(90deg, #A3A3A3 30%, #000 50%, #A3A3A3 70%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Thinking...
                </p>
              ) : (
                activeCard
              )}
            </>
          );
        })()}


        {/* Completion summary */}
        {allDone && completionSummary && (
          <div className="space-y-3">
            <PlaudAvatar />
            <CompletionCard
              items={completionSummary}
              onBack={() => router.push("/sales")}
            />
          </div>
        )}

      </div>

      {/* Message input */}
      <div className="shrink-0 px-6 pt-3 pb-8">
        <div className="flex items-center gap-3 bg-[#EBEBEB] rounded-[5px] pl-4 pr-3 py-2.5">
          {isListening ? (
            /* Audio recording waveform — real-time, scrolling right */
            <div
              ref={waveformRef}
              className="flex-1 flex items-center h-6 gap-[3px] overflow-hidden"
            >
              {/* Pre-fill with silent bars to fill the full width */}
              {Array.from({ length: Math.max(0, 100 - waveformBars.length) }).map((_, i) => (
                <div
                  key={`s${i}`}
                  className="w-[1.5px] shrink-0 bg-[#7A7A7A] rounded-full"
                  style={{ height: "6px" }}
                />
              ))}
              {waveformBars.map((h, i) => (
                <div
                  key={i}
                  className="w-[1.5px] shrink-0 bg-[#7A7A7A] rounded-full transition-[height] duration-75"
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
          ) : isTranscribing ? (
            /* Transcribing state — shimmer sweep text */
            <p className="flex-1 text-[16px] leading-6 animate-shimmer-text"
              style={{
                backgroundImage: "linear-gradient(90deg, #A3A3A3 30%, #000 50%, #A3A3A3 70%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Transcribing...
            </p>
          ) : (
            /* Text input */
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              placeholder="Type a message"
              disabled={isProcessing || allDone}
              className="flex-1 bg-transparent text-[16px] leading-6 text-black outline-none placeholder:text-[#A3A3A3] disabled:opacity-50"
            />
          )}

          {/* Right icon: mic (default) or send (when has text / recording / transcribing) */}
          {inputText.trim() || isListening || isTranscribing ? (
            <button
              onClick={isListening ? toggleListening : handleSendMessage}
              disabled={isProcessing || allDone || isTranscribing}
              className={`w-6 h-6 rounded-full bg-black flex items-center justify-center shrink-0 disabled:opacity-30 ${isTranscribing ? "opacity-30" : ""}`}
            >
              <img src="/icons/icon-arrow-up.svg" alt="Send" className="w-[9px] h-3" />
            </button>
          ) : (
            <button
              onClick={toggleListening}
              disabled={isProcessing || allDone}
              className="w-6 h-6 flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              <img src="/icons/icon-mic.svg" alt="Mic" className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {showSkipDialog && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSkipDialog(false)} />
          <div className="relative w-full bg-white rounded-t-[5px] flex flex-col">
            {/* Header */}
            <div className="px-6">
              <div className="flex items-start gap-4 py-4 border-b border-[#EBEBEB]">
                <h3 className="flex-1 text-[28px] font-light leading-8 text-black">
                  Skip updates
                </h3>
                <button
                  onClick={() => setShowSkipDialog(false)}
                  className="w-8 h-8 flex items-center justify-center shrink-0"
                >
                  <X className="w-6 h-6 text-black" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="px-6 py-6">
              <p className="text-[16px] text-[#3D3D3D] leading-6">
                These updates won&apos;t be applied to your CRM.{" "}
                <span className="font-semibold">
                  This action cannot be undone.
                </span>
              </p>
            </div>
            {/* Buttons */}
            <div className="flex gap-3 px-6 pt-2 pb-4">
              <button
                onClick={() => setShowSkipDialog(false)}
                className="flex-1 py-[12px] border border-[#ADADAD] rounded-[5px] text-[16px] font-normal text-black"
              >
                Cancel
              </button>
              <button
                onClick={handleSkip}
                className="flex-1 py-[12px] bg-black text-white rounded-[5px] text-[16px] font-semibold"
              >
                Skip
              </button>
            </div>
            {/* Safe area */}
            <div className="h-[34px]" />
          </div>
        </div>
      )}

      {showApplyAllDialog && (
        <div className="absolute inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowApplyAllDialog(false)} />
          <div className="relative w-full bg-white rounded-t-[5px] flex flex-col">
            {/* Header */}
            <div className="px-6">
              <div className="flex items-start gap-4 py-4 border-b border-[#EBEBEB]">
                <h3 className="flex-1 text-[28px] font-light leading-8 text-black">
                  Apply all updates
                </h3>
                <button
                  onClick={() => setShowApplyAllDialog(false)}
                  className="w-8 h-8 flex items-center justify-center shrink-0"
                >
                  <X className="w-6 h-6 text-black" />
                </button>
              </div>
            </div>
            {/* Body */}
            <div className="px-6 py-6">
              <p className="text-[16px] text-[#3D3D3D] leading-6">
                All updates will be applied to your CRM.
              </p>
            </div>
            {/* Buttons */}
            <div className="flex gap-3 px-6 pt-2 pb-4">
              <button
                onClick={() => setShowApplyAllDialog(false)}
                className="flex-1 py-[12px] border border-[#ADADAD] rounded-[5px] text-[16px] font-normal text-black"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyAll}
                className="flex-1 py-[12px] bg-black text-white rounded-[5px] text-[16px] font-semibold"
              >
                Apply all ({totalRecordings})
              </button>
            </div>
            {/* Safe area */}
            <div className="h-[34px]" />
          </div>
        </div>
      )}

      {/* Edit sheet */}
      {editSection && (
        <EditSheet
          objectType={editSection.objectType}
          changes={editSection.changes}
          editValues={editValues}
          onFieldChange={(changeId, fieldIdx, value) => {
            setEditValues((prev) => {
              const next = new Map(prev);
              const changeMap = new Map(next.get(changeId) || []);
              changeMap.set(fieldIdx, value);
              next.set(changeId, changeMap);
              return next;
            });
          }}
          onSave={handleSaveEdits}
          onClose={() => {
            setEditSection(null);
            setEditValues(new Map());
          }}
        />
      )}
    </div>
  );
}

// ─── Recording Paginator ─────────────────────────────────────────────────────

function RecordingPaginator({
  current,
  total,
  remaining,
  onPrev,
  onNext,
  onApplyAll,
}: {
  current: number;
  total: number;
  remaining: number;
  onPrev: () => void;
  onNext: () => void;
  onApplyAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev}
          disabled={current === 0}
          className="w-5 h-5 flex items-center justify-center disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5 text-[#A3A3A3]" />
        </button>
        <span className="text-[13px] font-normal tabular-nums leading-4">
          <span className="text-[#A3A3A3]">{current + 1}</span>
          <span>/{total}</span>
        </span>
        <button
          onClick={onNext}
          disabled={current === total - 1}
          className="w-5 h-5 flex items-center justify-center disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5 text-[#A3A3A3]" />
        </button>
      </div>
      <button
        onClick={onApplyAll}
        className="h-8 px-4 rounded-[5px] text-[14px] font-normal text-[#3D3D3D]"
      >
        Apply all ({total})
      </button>
    </div>
  );
}

// ─── Changes Card ────────────────────────────────────────────────────────────

function ChangesCard({
  sectionsByType,
  recentlyUpdated,
  onEdit,
}: {
  sectionsByType: Map<string, ProposedChange[]>;
  recentlyUpdated: Set<string>;
  onEdit: (objectType: string, changes: ProposedChange[]) => void;
}) {
  const types = Array.from(sectionsByType.keys());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(types.length > 0 ? [types[0]] : [])
  );

  // Auto-expand first section when types change
  useEffect(() => {
    if (types.length > 0 && expandedSections.size === 0) {
      setExpandedSections(new Set([types[0]]));
    }
  }, [types.join(",")]);

  const toggleSection = (type: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  return (
    <div>
      {types.map((type, idx) => {
        const changes = sectionsByType.get(type)!;
        const isExpanded = expandedSections.has(type);
        const totalFields = changes.reduce(
          (acc, c) => acc + c.changes.filter((d) => !/Id$/.test(d.field)).length,
          0
        );

        return (
          <div key={type} className="border-b border-[#EBEBEB] py-5 first:border-t">
            {/* Section header */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => toggleSection(type)}
                className="flex items-baseline gap-1 flex-1 min-w-0"
              >
                <span className="text-[20px] font-light leading-7 text-black">
                  {type}
                </span>
                <span className="text-[14px] font-light text-[#A3A3A3]">
                  ({totalFields} update{totalFields !== 1 ? "s" : ""})
                </span>
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {isExpanded && (
                  <button
                    onClick={() => onEdit(type, changes)}
                    className="w-5 h-5 flex items-center justify-center"
                  >
                    <img src="/icons/icon-rename.svg" alt="Edit" className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={() => toggleSection(type)}
                  className="w-5 h-5 flex items-center justify-center"
                >
                  {isExpanded ? (
                    <ChevronUp className="w-5 h-5 text-black" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-black" />
                  )}
                </button>
              </div>
            </div>

            {/* Expanded fields */}
            <div
              className="grid transition-[grid-template-rows] duration-300 ease-in-out"
              style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
              <div className="mt-2 space-y-4">
                {changes.map((change) => (
                  <div key={change.id}>
                    {/* Object name tag pill */}
                    {change.object_name && (
                      <div className="mb-4">
                        <span className="inline-block px-2 py-1 bg-[#EBEBEB] rounded-[2px] text-[11px] text-[#7A7A7A] leading-[13px]">
                          {change.object_name}
                        </span>
                      </div>
                    )}

                    {/* Field diffs */}
                    {change.changes
                      .filter((d) => !/Id$/.test(d.field))
                      .map((diff, di) => {
                        const isUpdated = recentlyUpdated.has(
                          `${change.id}:${diff.field}`
                        );
                        return (
                          <div key={di} className="mb-4 last:mb-0">
                            <p className="text-[13px] text-[#3D3D3D] leading-4 mb-1">
                              {diff.label}
                            </p>
                            <div className="flex items-start gap-2">
                              {diff.old != null && diff.old !== "" ? (
                                <>
                                  <span className="text-[14px] text-[#ADADAD] line-through leading-5">
                                    {diff.old}
                                  </span>
                                  <ArrowRight className="w-4 h-4 text-[#ADADAD] shrink-0 mt-0.5 rotate-0" />
                                </>
                              ) : (
                                <>
                                  <span className="text-[14px] text-[#ADADAD] line-through leading-5">
                                    (Empty)
                                  </span>
                                  <ArrowRight className="w-4 h-4 text-[#ADADAD] shrink-0 mt-0.5" />
                                </>
                              )}
                              <span
                                className={`text-[14px] font-semibold leading-5 ${
                                  isUpdated
                                    ? "text-[#22C55E]"
                                    : "text-black"
                                }`}
                              >
                                {diff.new}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Processing Bubble ───────────────────────────────────────────────────────

function ProcessingBubble({
  message,
  progress,
}: {
  message: string;
  progress?: { completed: number; total: number };
}) {
  const [displayPct, setDisplayPct] = useState(0);
  const targetPct =
    progress && progress.total > 0
      ? Math.round((progress.completed / progress.total) * 100)
      : 0;

  useEffect(() => {
    if (targetPct <= displayPct) return;
    const interval = setInterval(() => {
      setDisplayPct((prev) => {
        const next = Math.min(prev + 2, targetPct);
        if (next >= targetPct) clearInterval(interval);
        return next;
      });
    }, 30);
    return () => clearInterval(interval);
  }, [targetPct]);

  return (
    <div className="bg-white rounded-xl px-4 py-3 border border-[#E8E8E8] min-w-[200px]">
      <div className="flex items-center gap-2.5">
        <div className="flex items-end gap-1 h-5">
          <span className="w-[6px] h-[6px] bg-[#999] rounded-full animate-[bounce_1.4s_ease-in-out_infinite_0ms]" />
          <span className="w-[6px] h-[6px] bg-[#999] rounded-full animate-[bounce_1.4s_ease-in-out_infinite_200ms]" />
          <span className="w-[6px] h-[6px] bg-[#999] rounded-full animate-[bounce_1.4s_ease-in-out_infinite_400ms]" />
        </div>
        <span className="text-[13px] text-[#999]">{message}</span>
      </div>
      {progress && progress.total > 0 && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex-1 h-1.5 bg-[#E8E8E8] rounded-full overflow-hidden">
            <div
              className="h-full bg-black rounded-full transition-[width] duration-300"
              style={{ width: `${displayPct}%` }}
            />
          </div>
          <span className="text-[11px] text-[#999] tabular-nums shrink-0 w-[28px] text-right">
            {displayPct}%
          </span>
        </div>
      )}
    </div>
  );
}

// ─── AI Response Bubble ──────────────────────────────────────────────────────

function AiResponseBubble({ text }: { text: string }) {
  // Detect "Updated" style responses
  const isUpdated =
    text.toLowerCase().includes("updated") &&
    text.length < 100;

  if (isUpdated) {
    return (
      <div className="flex items-center gap-1.5">
        <Check className="w-5 h-5 text-[#22C55E]" />
        <span className="text-[14px] font-normal leading-5 text-[#22C55E]">
          {text}
        </span>
      </div>
    );
  }

  return (
    <p className="text-[14px] font-normal leading-5 text-[#3D3D3D]">
      {text}
    </p>
  );
}

// ─── Progress Card ───────────────────────────────────────────────────────────

function ProgressCard({ progress }: { progress: number }) {
  return (
    <div className="border-l-[3px] border-[#1A89FF] pl-3 py-1">
      <div className="flex items-center gap-2">
        <Loader2 className="w-5 h-5 text-[#7A7A7A] animate-spin shrink-0" />
        <span className="flex-1 text-[14px] font-normal leading-5 text-black">
          Applying updates to your CRM
        </span>
        <span className="text-[14px] font-normal leading-5 text-[#A3A3A3] tabular-nums">
          {progress}%
        </span>
      </div>
      <div className="mt-2 ml-7 h-[3px] bg-[#EBEBEB] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1A89FF] rounded-full transition-[width] duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// ─── Completion Card ─────────────────────────────────────────────────────────

function CompletionCard({
  items,
  onBack,
}: {
  items: string[];
  onBack: () => void;
}) {
  return (
    <div>
      <div className="border-l-[3px] border-[#36D96C] pl-3 py-1 space-y-3">
        <p className="text-[20px] font-light leading-7 text-black">
          All updates applied
        </p>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <Check className="w-4 h-4 text-[#A3A3A3] shrink-0" />
              <span className="text-[14px] font-normal leading-5 text-[#A3A3A3]">{item}</span>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={onBack}
        className="mt-4 h-8 px-4 border border-[#ADADAD] rounded-[5px] text-[14px] font-normal text-black"
      >
        Back to meetings
      </button>
    </div>
  );
}

// ─── Bottom Sheet ────────────────────────────────────────────────────────────

function BottomSheet({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl px-5 pt-5 pb-8 animate-in slide-in-from-bottom duration-200">
        {children}
      </div>
    </div>
  );
}

// ─── Edit Sheet ──────────────────────────────────────────────────────────────

function EditSheet({
  objectType,
  changes,
  editValues,
  onFieldChange,
  onSave,
  onClose,
}: {
  objectType: string;
  changes: ProposedChange[];
  editValues: Map<string, Map<number, string>>;
  onFieldChange: (changeId: string, fieldIdx: number, value: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const hasChanges = editValues.size > 0;

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[#F9F9F9] rounded-t-[5px] flex flex-col animate-slide-up" style={{ height: "93%" }}>
        {/* Header */}
        <div className="px-6">
          <div className="flex items-start gap-4 py-4 border-b border-[#EBEBEB]">
            <h3 className="flex-1 text-[28px] font-light leading-8 text-black">
              Edit
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center shrink-0"
            >
              <X className="w-6 h-6 text-black" />
            </button>
          </div>
        </div>

        {/* Fields */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {changes.map((change) =>
            change.changes
              .filter((d) => !/Id$/.test(d.field))
              .map((diff, fieldIdx) => {
                const editedValue =
                  editValues.get(change.id)?.get(fieldIdx) ?? diff.new;
                return (
                  <div key={`${change.id}-${fieldIdx}`} className="space-y-2">
                    <p className="text-[16px] text-[#3D3D3D] leading-6">
                      {diff.label}
                    </p>
                    {diff.old != null && diff.old !== "" && (
                      <div className="flex items-center gap-2">
                        <span className="text-[16px] text-[#ADADAD] leading-6">
                          {diff.old}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[#ADADAD] shrink-0" />
                      </div>
                    )}
                    <textarea
                      value={editedValue}
                      onChange={(e) => {
                        onFieldChange(change.id, fieldIdx, e.target.value);
                        // Auto-resize
                        e.target.style.height = "auto";
                        e.target.style.height = `${e.target.scrollHeight}px`;
                      }}
                      ref={(el) => {
                        // Initial auto-resize on mount
                        if (el) {
                          el.style.height = "auto";
                          el.style.height = `${el.scrollHeight}px`;
                        }
                      }}
                      rows={1}
                      className="w-full border border-[#CCC] rounded-[5px] px-4 py-3 text-[16px] leading-6 text-black outline-none focus:border-[#999] bg-white resize-none overflow-hidden"
                    />
                  </div>
                );
              })
          )}
        </div>

        {/* Save button */}
        <div className="px-6 pt-2 pb-4 shrink-0">
          <button
            onClick={onSave}
            className={`w-full py-3 rounded-[5px] text-[16px] font-semibold transition-colors ${
              hasChanges
                ? "bg-black text-white"
                : "bg-[#C2C2C2] text-[#A3A3A3]"
            }`}
          >
            Save
          </button>
        </div>
        {/* Safe area */}
        <div className="h-[34px] shrink-0" />
      </div>
    </div>
  );
}
