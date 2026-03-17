"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { MeetingDetail, RecordingFile } from "@/lib/types";
import { ChevronRight, X, Square } from "lucide-react";

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  // Recording state
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const loadMeeting = useCallback(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error);
  }, [id]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorder.start(1000); // collect chunks every second
      mediaRecorderRef.current = mediaRecorder;
      startTimeRef.current = Date.now();
      setRecording(true);
      setElapsed(0);

      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (e) {
      console.error("Mic access denied:", e);
    }
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current || !meeting) return;

    const recorder = mediaRecorderRef.current;
    const duration = Math.floor((Date.now() - startTimeRef.current) / 1000);

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Wait for recorder to finish
    await new Promise<void>((resolve) => {
      const prevOnStop = recorder.onstop;
      recorder.onstop = (e) => {
        if (prevOnStop && typeof prevOnStop === "function") {
          (prevOnStop as (ev: Event) => void)(e);
        }
        resolve();
      };
      recorder.stop();
    });

    setRecording(false);
    setUploading(true);

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    try {
      await api.uploadRecording(
        meeting.id,
        blob,
        `Recording - ${meeting.title}`,
        duration,
      );
      loadMeeting(); // refresh to show new file in Related Files
    } catch (e) {
      console.error("Upload failed:", e);
    } finally {
      setUploading(false);
    }
  };

  const handleUnlink = async (file: MeetingDetail["linked_files"][number]) => {
    if (!meeting) return;
    setUnlinking(file.id);
    try {
      await api.unlinkRecording(file.id);
      setMeeting((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          linked_files: prev.linked_files.filter((f) => f.id !== file.id),
        };
      });
    } catch (e) {
      console.error("Failed to unlink:", e);
    } finally {
      setUnlinking(null);
    }
  };

  const handleFileLinked = () => {
    setShowPicker(false);
    loadMeeting();
  };

  if (!meeting)
    return (
      <div className="flex-1 flex items-center justify-center text-[#888]">
        Loading...
      </div>
    );

  const hasSalesDetails = meeting.account?.name || meeting.opportunity?.name;
  const sources = "Salesforce"; // TODO: derive from event_sources

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F9F9]">
      <BackHeader title={`Meeting from ${sources}`} fallbackHref="/sales" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-10 pt-4">
          {/* Meeting Details */}
          <div className="flex flex-col gap-4">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3">
                <h1 className="text-[28px] font-light leading-8 text-black">
                  {meeting.opportunity?.name || meeting.title}
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-6">
              <div className="flex items-center gap-2">
                <Image src="/icons/calendar.svg" alt="" width={24} height={24} className="shrink-0" />
                <p className="text-[16px] text-[#3D3D3D] leading-6">
                  {meeting.date} ｜ {meeting.time_start} - {meeting.time_end}
                </p>
              </div>

              {meeting.location && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/location.svg" alt="" width={24} height={24} className="shrink-0" />
                  <p className="text-[16px] text-[#3D3D3D] leading-6">
                    {meeting.location}
                  </p>
                </div>
              )}

              {meeting.attendees.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/participants.svg" alt="" width={24} height={24} className="shrink-0" />
                    <p className="text-[16px] text-[#3D3D3D] leading-6">
                      {meeting.attendees.length} participant
                      {meeting.attendees.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button className="flex items-center gap-1">
                    <span className="text-[13px] text-[#A3A3A3]">Show all</span>
                    <ChevronRight className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sales Details */}
          {hasSalesDetails && (
            <div className="flex flex-col gap-5">
              <div className="px-6">
                <div className="border-b border-[#EBEBEB] pb-3">
                  <h2 className="text-[20px] font-light leading-7 text-black">
                    Sales Details
                  </h2>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-6">
                {meeting.account?.name && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Image src="/icons/account.svg" alt="" width={24} height={24} className="shrink-0" />
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {meeting.account.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 pl-8">
                      {meeting.account.annual_revenue && (
                        <p className="text-[16px] text-[#3D3D3D] leading-6">
                          {meeting.account.annual_revenue} ARR
                        </p>
                      )}
                      {meeting.account.sector && (
                        <p className="text-[13px] text-[#A3A3A3] leading-4">
                          {meeting.account.sector}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {meeting.opportunity?.name && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Image src="/icons/opportunity.svg" alt="" width={24} height={24} className="shrink-0" />
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {meeting.opportunity.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 pl-8">
                      {meeting.opportunity.amount && (
                        <p className="text-[16px] text-[#3D3D3D] leading-6">
                          {meeting.opportunity.amount}
                        </p>
                      )}
                      <p className="text-[13px] text-[#A3A3A3] leading-4">
                        {[meeting.opportunity.stage, meeting.opportunity.close_date]
                          .filter(Boolean)
                          .join(" ｜ ")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="flex flex-col gap-5">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Feedback
                </h2>
                <div className="flex items-center gap-3">
                  <Image src="/icons/pen.svg" alt="" width={24} height={24} />
                  {!recording && (
                    <button onClick={handleStartRecording} className="cursor-pointer">
                      <Image src="/icons/mic.svg" alt="" width={24} height={24} />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6">
              {recording ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-[#FF3B30] animate-pulse" />
                    <span className="text-[14px] text-[#FF3B30] font-medium">
                      Recording... {formatElapsed(elapsed)}
                    </span>
                  </div>
                  <button
                    onClick={handleStopRecording}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-[#FF3B30] rounded-[12px] cursor-pointer"
                  >
                    <Square className="w-4 h-4 text-white fill-white" strokeWidth={0} />
                    <span className="text-[15px] font-semibold text-white">Stop Recording</span>
                  </button>
                </div>
              ) : uploading ? (
                <p className="text-[14px] text-[#7A7A7A]">Uploading recording...</p>
              ) : (meeting.feedback_recordings?.length ?? 0) > 0 ? (
                <div className="flex flex-col gap-4">
                  {meeting.feedback_recordings!.map((r) => (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-[#3D3D3D] shrink-0" />
                      <div className="flex-1">
                        <p className="text-[14px] text-[#3D3D3D] leading-5">{r.title}</p>
                        <p className="text-[13px] text-[#7A7A7A] leading-4">{formatHumanDuration(r.duration_seconds)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[16px] text-[#A3A3A3] leading-6">
                  {meeting.feedback || "No feedback yet"}
                </p>
              )}
            </div>
          </div>

          {/* Related Files */}
          <div className="flex flex-col gap-5 pb-8">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Related Files
                </h2>
                <button onClick={() => setShowPicker(true)} className="cursor-pointer">
                  <Image src="/icons/plus.svg" alt="" width={24} height={24} />
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-6 px-6">
              {meeting.linked_files.length > 0 ? (
                meeting.linked_files.map((f) => (
                  <div key={f.id} className="flex items-start justify-between">
                    <div className="flex-1 flex flex-col gap-1">
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {f.title}
                      </p>
                      <p className="text-[13px] text-[#7A7A7A] leading-4">
                        {formatRecordedMeta(f.recorded_at, f.duration_seconds)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnlink(f)}
                      disabled={unlinking === f.id}
                      className="cursor-pointer shrink-0 disabled:opacity-40"
                    >
                      <Image src="/icons/minus.svg" alt="" width={24} height={24} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-[16px] text-[#A3A3A3] leading-6">
                  No related files
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* File Picker Bottom Sheet */}
      {showPicker && (
        <FilePicker
          eventId={meeting.id}
          linkedRecordingIds={new Set(meeting.linked_files.map((f) => f.id))}
          onLinked={handleFileLinked}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDateLabel(recordedAt?: string): string {
  if (!recordedAt) return "";
  const d = new Date(recordedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const recordDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  if (recordDate.getTime() === today.getTime()) return `Today at ${time}`;
  if (recordDate.getTime() === yesterday.getTime()) return `Yesterday at ${time}`;
  return `${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`;
}

function formatHumanDuration(seconds: number): string {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}

function formatRecordedMeta(recordedAt?: string, durationSeconds?: number): string {
  const parts: string[] = [];
  const dateLabel = formatDateLabel(recordedAt);
  if (dateLabel) parts.push(dateLabel);
  const durLabel = formatHumanDuration(durationSeconds || 0);
  if (durLabel) parts.push(durLabel);
  return parts.join(" ｜ ");
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function FilePicker({
  eventId,
  linkedRecordingIds,
  onLinked,
  onClose,
}: {
  eventId: string;
  linkedRecordingIds: Set<string>;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    api.getFiles().then((f) => {
      setFiles(f);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleLink = async (file: RecordingFile) => {
    setLinking(file.id);
    try {
      await api.linkRecording(file.id, eventId);
      onLinked();
    } catch (e) {
      console.error("Failed to link:", e);
      setLinking(null);
    }
  };

  const availableFiles = files.filter((f) => !linkedRecordingIds.has(f.id));

  return (
    <>
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-[16px] max-h-[60%] flex flex-col">
        <div className="flex items-center justify-between px-6 pt-4 pb-3 border-b border-[#EBEBEB]">
          <h3 className="text-[18px] leading-6 text-black">Add File</h3>
          <button onClick={onClose} className="cursor-pointer">
            <X className="w-5 h-5 text-[#7A7A7A]" strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-[14px] text-[#A3A3A3]">Loading files...</p>
          ) : availableFiles.length === 0 ? (
            <p className="text-[14px] text-[#A3A3A3]">No files available to link</p>
          ) : (
            <div className="flex flex-col gap-4">
              {availableFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => handleLink(file)}
                  disabled={linking === file.id}
                  className="flex items-center justify-between py-2 cursor-pointer disabled:opacity-50"
                >
                  <div className="flex flex-col gap-0.5 text-left">
                    <p className="text-[16px] text-[#3D3D3D] leading-6">
                      {file.title}
                    </p>
                    <p className="text-[13px] text-[#7A7A7A] leading-4">
                      {formatDuration(file.duration_seconds)}
                    </p>
                  </div>
                  {linking === file.id ? (
                    <span className="text-[14px] text-[#7A7A7A]">Linking...</span>
                  ) : (
                    <Image src="/icons/plus.svg" alt="" width={20} height={20} className="shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
