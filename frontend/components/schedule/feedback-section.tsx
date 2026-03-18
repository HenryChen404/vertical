"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { api } from "@/lib/api";

type FeedbackState = "idle" | "recording" | "transcribing";

interface FeedbackSectionProps {
  meetingId: string;
  feedback: string;
  onFeedbackChange: (feedback: string) => void;
}

export function FeedbackSection({
  meetingId,
  feedback,
  onFeedbackChange,
}: FeedbackSectionProps) {
  const [state, setState] = useState<FeedbackState>("idle");
  const [showPanel, setShowPanel] = useState(false);
  const [draftText, setDraftText] = useState("");
  const [saving, setSaving] = useState(false);

  // Recording refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleSaveFeedback = async (text: string) => {
    setSaving(true);
    try {
      await api.updateFeedback(meetingId, text);
      onFeedbackChange(text);
      setShowPanel(false);
    } catch (e) {
      console.error("Failed to save feedback:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditor = () => {
    setDraftText(feedback);
    setShowPanel(true);
  };

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setState("recording");
    } catch (e) {
      console.error("Mic access denied:", e);
    }
  };

  const handleStopRecording = async () => {
    if (!mediaRecorderRef.current) return;

    const recorder = mediaRecorderRef.current;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        resolve();
      };
      recorder.stop();
    });

    setState("transcribing");

    const blob = new Blob(chunksRef.current, { type: "audio/webm" });

    try {
      const result = await api.transcribeFeedback(meetingId, blob);
      onFeedbackChange(result.feedback);
    } catch (e) {
      console.error("Transcription failed:", e);
    } finally {
      setState("idle");
    }
  };

  return (
    <>
      {/* Feedback Section */}
      <div className="flex flex-col gap-5">
        <div className="px-6">
          <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
            <h2 className="text-[20px] font-light leading-7 text-black">
              Feedback
            </h2>
            <div className="flex items-center gap-3">
              {state === "idle" && (
                <>
                  <button
                    onClick={handleOpenEditor}
                    className="cursor-pointer"
                  >
                    <Image
                      src="/icons/pen.svg"
                      alt="Edit"
                      width={24}
                      height={24}
                    />
                  </button>
                  <button
                    onClick={handleStartRecording}
                    className="cursor-pointer"
                  >
                    <Image
                      src="/icons/mic.svg"
                      alt="Record"
                      width={24}
                      height={24}
                    />
                  </button>
                </>
              )}
              {state === "recording" && (
                <>
                  <button
                    onClick={handleOpenEditor}
                    className="cursor-pointer"
                  >
                    <Image
                      src="/icons/pen.svg"
                      alt="Edit"
                      width={24}
                      height={24}
                    />
                  </button>
                  <Image
                    src="/icons/mic.svg"
                    alt="Recording"
                    width={24}
                    height={24}
                    className="opacity-50"
                  />
                </>
              )}
              {state === "transcribing" && (
                <>
                  <Image
                    src="/icons/pen.svg"
                    alt="Edit"
                    width={24}
                    height={24}
                    className="opacity-30"
                  />
                  <Image
                    src="/icons/mic.svg"
                    alt="Transcribing"
                    width={24}
                    height={24}
                    className="opacity-50"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="px-6">
          {state === "idle" && (
            <p
              className={`text-[16px] leading-6 ${feedback ? "text-[#3D3D3D]" : "text-[#A3A3A3]"}`}
            >
              {feedback || "No feedback yet"}
            </p>
          )}

          {state === "recording" && (
            <div className="flex flex-col gap-6 items-center">
              <div className="flex flex-col gap-3 items-center">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-black" />
                  <span className="text-[16px] text-black leading-6">
                    Recording in progress
                  </span>
                </div>
                <p className="text-[13px] text-[#A3A3A3] leading-4 text-center">
                  Tap &quot;Stop recording&quot; to finish and transcribe.
                </p>
              </div>
              <button
                onClick={handleStopRecording}
                className="w-full py-3 bg-black text-white text-[16px] font-semibold leading-6 rounded-[5px] cursor-pointer"
              >
                Stop recording
              </button>
            </div>
          )}

          {state === "transcribing" && (
            <div className="flex items-center justify-center gap-2 py-2">
              <svg
                className="animate-spin h-4 w-4 text-[#A3A3A3]"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-[16px] text-[#A3A3A3] leading-6">
                Transcribing...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Edit Feedback Bottom Panel */}
      {showPanel && (
        <FeedbackEditPanel
          initialText={draftText}
          saving={saving}
          onSave={handleSaveFeedback}
          onCancel={() => setShowPanel(false)}
        />
      )}
    </>
  );
}

function FeedbackEditPanel({
  initialText,
  saving,
  onSave,
  onCancel,
}: {
  initialText: string;
  saving: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);

  useEffect(() => {
    // Focus textarea on mount
    setTimeout(() => textareaRef.current?.focus(), 100);
  }, []);

  // Swipe-down to dismiss
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (dragStartRef.current === null) return;
    const diff = e.changedTouches[0].clientY - dragStartRef.current;
    if (diff > 80) {
      onCancel();
    }
    dragStartRef.current = null;
  };

  return (
    <>
      <div
        className="absolute inset-0 bg-black/40 z-40"
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        className="absolute bottom-0 left-0 right-0 z-50 bg-white rounded-t-[5px] flex flex-col animate-slide-up"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-0">
          <div className="w-9 h-1 rounded-full bg-[#D9D9D9]" />
        </div>

        {/* Header */}
        <div className="px-6">
          <div className="border-b border-[#EBEBEB] py-4">
            <h3 className="text-[28px] font-light leading-8 text-black">
              Feedback
            </h3>
          </div>
        </div>

        {/* Text Area */}
        <div className="px-6 py-4">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter your feedback..."
            className="w-full h-32 p-4 border border-black rounded-[5px] text-[16px] text-[#3D3D3D] leading-6 resize-none outline-none placeholder:text-[#A3A3A3]"
          />
        </div>

        {/* Buttons */}
        <div className="flex gap-3 px-6 pt-2 pb-7">
          <button
            onClick={onCancel}
            className="flex-1 py-3 border border-[#ADADAD] rounded-[5px] text-[16px] text-black leading-6 cursor-pointer bg-white"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(text)}
            disabled={saving}
            className="flex-1 py-3 bg-black rounded-[5px] text-[16px] font-semibold text-white leading-6 cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
