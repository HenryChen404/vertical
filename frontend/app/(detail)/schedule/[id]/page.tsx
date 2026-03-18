"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { MeetingDetail, RecordingFile } from "@/lib/types";
import { ChevronRight, Circle, CircleCheck } from "lucide-react";
import { FeedbackSection } from "@/components/schedule/feedback-section";

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<MeetingDetail["linked_files"][number] | null>(null);

  const loadMeeting = useCallback(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error);
  }, [id]);

  useEffect(() => {
    loadMeeting();
  }, [loadMeeting]);

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
                  <Link href={`/schedule/${id}/participants`} className="flex items-center gap-1">
                    <span className="text-[13px] text-[#A3A3A3]">Show all</span>
                    <ChevronRight className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.5} />
                  </Link>
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
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Image src="/icons/opportunity.svg" alt="" width={24} height={24} className="shrink-0" />
                        <p className="text-[16px] text-[#3D3D3D] leading-6">
                          {meeting.opportunity.name}
                        </p>
                      </div>
                      {meeting.opportunity.id && (
                        <Link href={`/deals/${meeting.opportunity.id}`} className="flex items-center gap-1">
                          <span className="text-[13px] text-[#A3A3A3]">View</span>
                          <ChevronRight className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.5} />
                        </Link>
                      )}
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
          <FeedbackSection
            meetingId={meeting.id}
            feedback={meeting.feedback}
            onFeedbackChange={(fb) =>
              setMeeting((prev) => (prev ? { ...prev, feedback: fb } : prev))
            }
          />

          {/* Related Recordings */}
          <div className="flex flex-col gap-5 pb-8">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Related Recordings
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
                      onClick={() => setConfirmRemove(f)}
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

      {/* Remove Confirmation Dialog */}
      {confirmRemove && (
        <>
          <div
            className="absolute inset-0 bg-black/40 z-40"
            onClick={() => setConfirmRemove(null)}
          />
          <div className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-[5px] flex flex-col animate-slide-up">
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <h3 className="text-[20px] font-light leading-7 text-black">
                Remove recording
              </h3>
              <button
                onClick={() => setConfirmRemove(null)}
                className="cursor-pointer text-[#3D3D3D]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <div className="px-6 pb-6">
              <p className="text-[16px] text-[#3D3D3D] leading-6">
                Remove recording from this meeting?{"\n"}
                The recording will remain in your library. It won&apos;t be attached to this meeting anymore.
              </p>
            </div>
            <div className="flex gap-3 px-6 pt-2 pb-6">
              <button
                onClick={() => setConfirmRemove(null)}
                className="flex-1 py-3 border border-[#ADADAD] rounded-[5px] text-[16px] text-black leading-6 cursor-pointer bg-white"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const file = confirmRemove;
                  setConfirmRemove(null);
                  await handleUnlink(file);
                }}
                disabled={unlinking === confirmRemove.id}
                className="flex-1 py-3 bg-black rounded-[5px] text-[16px] font-semibold text-white leading-6 cursor-pointer disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        </>
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

function formatShortDate(recordedAt?: string): string {
  if (!recordedAt) return "";
  const d = new Date(recordedAt);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}`;
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getFiles().then((f) => {
      setFiles(f);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const availableFiles = files.filter((f) => !linkedRecordingIds.has(f.id));

  const toggleFile = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await Promise.all(
        Array.from(selected).map((id) => api.linkRecording(id, eventId))
      );
      onLinked();
    } catch (e) {
      console.error("Failed to link:", e);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 z-50 bg-[#F9F9F9] rounded-t-[5px] flex flex-col max-h-[88%] animate-slide-up">
        {/* Header */}
        <div className="px-6 shrink-0">
          <div className="border-b border-[#EBEBEB] py-4">
            <h3 className="text-[28px] font-light leading-8 text-black">
              Add Related Recordings
            </h3>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <p className="text-[16px] text-[#A3A3A3]">Loading...</p>
          ) : availableFiles.length === 0 ? (
            <p className="text-[16px] text-[#A3A3A3]">No recordings available</p>
          ) : (
            <div className="flex flex-col">
              {availableFiles.map((file, i) => (
                <div key={file.id}>
                  <button
                    onClick={() => toggleFile(file.id)}
                    className="flex items-center w-full py-1 cursor-pointer"
                  >
                    <div className="flex-1 flex flex-col gap-1 text-left pr-4">
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {file.title}
                      </p>
                      <p className="text-[13px] text-[#A3A3A3] leading-4">
                        {formatShortDate(file.recorded_at)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {selected.has(file.id) ? (
                        <CircleCheck className="w-6 h-6 text-black fill-black stroke-white" strokeWidth={1.5} />
                      ) : (
                        <Circle className="w-6 h-6 text-[#C2C2C2]" strokeWidth={1.5} />
                      )}
                    </div>
                  </button>
                  {i < availableFiles.length - 1 && (
                    <div className="border-b border-[#EBEBEB] my-4" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pt-2 pb-6 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-[#ADADAD] rounded-[5px] text-[16px] text-black leading-6 cursor-pointer bg-white"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0 || submitting}
            className={`flex-1 py-3 rounded-[5px] text-[16px] font-semibold leading-6 cursor-pointer ${
              selected.size > 0
                ? "bg-black text-white"
                : "bg-[#C2C2C2] text-[#A3A3A3]"
            } disabled:opacity-70`}
          >
            {submitting ? "Adding..." : selected.size > 0 ? `Add (${selected.size})` : "Add"}
          </button>
        </div>
      </div>
    </>
  );
}
