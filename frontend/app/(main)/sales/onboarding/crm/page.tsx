"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";
import { api } from "@/lib/api";

export default function CrmOnboardingPage() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (provider: string) => {
    setConnecting(provider);
    try {
      await api.connectCrm(provider);
      router.push("/sales/onboarding/calendar");
    } catch {
      setConnecting(null);
    }
  };

  return (
    <div className="px-6 flex-1">
      <div className="flex flex-col items-center gap-6 mt-20">
        <div className="w-[72px] h-[72px] rounded-full bg-[#F0F0F0] flex items-center justify-center">
          <Database className="w-8 h-8 text-[#888888]" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-[20px] font-semibold">Connect your CRM</h2>
          <p className="text-[15px] text-[#888888] leading-relaxed">
            Link your CRM to automatically sync meeting data and keep your pipeline up to date.
          </p>
        </div>
        <div className="w-full space-y-3 mt-4">
          <button
            onClick={() => handleConnect("salesforce")}
            disabled={connecting !== null}
            className="w-full h-12 bg-black text-white rounded-xl text-[16px] font-medium disabled:opacity-50"
          >
            {connecting === "salesforce" ? "Connecting..." : "Connect Salesforce"}
          </button>
          <button
            onClick={() => handleConnect("hubspot")}
            disabled={connecting !== null}
            className="w-full h-12 bg-white border border-[#EBEBEB] rounded-xl text-[16px] font-medium disabled:opacity-50"
          >
            {connecting === "hubspot" ? "Connecting..." : "Connect HubSpot"}
          </button>
        </div>
      </div>
    </div>
  );
}
