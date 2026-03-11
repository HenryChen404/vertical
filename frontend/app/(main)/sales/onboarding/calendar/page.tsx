"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { api } from "@/lib/api";

export default function CalendarOnboardingPage() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      await api.connectCalendar(provider);
      router.push("/sales");
    } catch {
      setConnecting(null);
    }
  };

  return (
    <div className="px-6 flex-1">
      <div className="flex flex-col items-center gap-6 mt-20">
        <div className="w-[72px] h-[72px] rounded-full bg-[#F0F0F0] flex items-center justify-center">
          <Calendar className="w-8 h-8 text-[#888888]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-[20px] font-semibold">Connect your Calendar</h2>
          <p className="text-[15px] text-[#888888] leading-relaxed">
            Sync your calendar to see upcoming meetings and automatically link recordings.
          </p>
        </div>
        <div className="w-full space-y-3 mt-4">
          <button
            onClick={() => handleConnect("google")}
            disabled={connecting !== null}
            className="w-full h-12 bg-black text-white rounded-xl text-[16px] font-medium disabled:opacity-50"
          >
            {connecting === "google" ? "Connecting..." : "Connect Google Calendar"}
          </button>
          <button
            onClick={() => handleConnect("outlook")}
            disabled={connecting !== null}
            className="w-full h-12 bg-white border border-[#EBEBEB] rounded-xl text-[16px] font-medium disabled:opacity-50"
          >
            {connecting === "outlook" ? "Connecting..." : "Connect Outlook Calendar"}
          </button>
        </div>
      </div>
    </div>
  );
}
