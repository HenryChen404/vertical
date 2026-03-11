"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import { Square, Calendar } from "lucide-react";

interface TranscriptLine {
  speaker: string;
  text: string;
  timestamp: string;
}

export default function RecordingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const startRecording = async () => {
    setRecording(true);
    setTranscript([]);
    setElapsed(0);
    await api.startRecording(id);

    const es = new EventSource(`${API_BASE}/api/schedule/${id}/recording/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "transcript") {
        setTranscript((prev) => [...prev, data]);
      } else if (data.type === "done") {
        es.close();
        setRecording(false);
      }
    };

    es.onerror = () => {
      es.close();
      setRecording(false);
    };
  };

  const stopRecording = async () => {
    eventSourceRef.current?.close();
    await api.stopRecording(id);
    setRecording(false);
  };

  // Elapsed timer
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title="Client Meeting" />

      {/* Meeting header */}
      <div className="flex items-center gap-2 px-4 py-3 bg-[#F9F9F9]">
        <Calendar className="w-4 h-4 text-[#888]" />
        <span className="text-[14px] font-semibold">Discovery Call - TechStart</span>
      </div>

      {/* Recording indicator */}
      {recording && (
        <div className="flex items-center justify-center gap-3 py-4">
          <div className="w-3 h-3 rounded-full bg-[#FB2C36] animate-pulse" />
          <span className="text-[20px] font-mono font-semibold">{formatElapsed(elapsed)}</span>
        </div>
      )}

      {/* Transcript area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {transcript.length === 0 && !recording && (
          <div className="text-center text-[#888] mt-20">
            <p className="text-[16px]">Tap to start recording</p>
          </div>
        )}
        {transcript.map((line, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">{line.speaker}</span>
              <span className="text-[11px] text-[#A3A3A3]">{line.timestamp}</span>
            </div>
            <p className="text-[14px] leading-relaxed">{line.text}</p>
          </div>
        ))}
      </div>

      {/* Control bar */}
      <div className="py-6 flex justify-center shrink-0">
        {recording ? (
          <button
            onClick={stopRecording}
            className="w-16 h-16 rounded-full bg-[#FB2C36] flex items-center justify-center"
          >
            <Square className="w-6 h-6 text-white fill-white" />
          </button>
        ) : (
          <button
            onClick={startRecording}
            className="w-16 h-16 rounded-full bg-[#FB2C36] flex items-center justify-center"
          >
            <div className="w-6 h-6 rounded-full bg-white" />
          </button>
        )}
      </div>
    </div>
  );
}
