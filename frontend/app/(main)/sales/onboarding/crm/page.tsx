"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { api } from "@/lib/api";

const INTEGRATIONS = [
  {
    id: "google_calendar",
    name: "Google Calendar",
    description: "Link to access upcoming meetings and meeting details.",
    icon: "https://www.figma.com/api/mcp/asset/42a3f103-0a8b-4fa1-9ac9-71a62899c3af",
    isCalendar: true,
    provider: "google",
  },
  {
    id: "outlook_calendar",
    name: "Outlook Calendar",
    description: "Link to access upcoming meetings and meeting details.",
    icon: "https://www.figma.com/api/mcp/asset/6b12cd01-6a2a-4b22-9807-36b9897daf99",
    isCalendar: true,
    provider: "outlook",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync meeting insights to update contacts and activities in Salesforce.",
    icon: "https://www.figma.com/api/mcp/asset/9ce60435-e1e0-4acb-bc04-da24815c7956",
    isCalendar: false,
    provider: "salesforce",
  },
];

const MORE_APPS = [
  { name: "Slack", icon: "https://www.figma.com/api/mcp/asset/1154cd58-6c85-4331-9681-d92b759cc356" },
  { name: "OneNote", icon: "https://www.figma.com/api/mcp/asset/ad5936b6-b3cb-41f1-8bc7-ffbfe806cfad" },
  { name: "Google Docs", icon: "https://www.figma.com/api/mcp/asset/ab1230a9-20fa-4887-b217-e246085dc9e7" },
  { name: "Notion", icon: "https://www.figma.com/api/mcp/asset/b3636924-f318-42bc-b0a5-936f89c35b46" },
  { name: "Teams", icon: "https://www.figma.com/api/mcp/asset/be5885e3-640c-4083-835d-0cb1ab7ab62d" },
  { name: "Google Drive", icon: "https://www.figma.com/api/mcp/asset/f8aca1e7-e443-4a40-b722-a8465deae2c7" },
  { name: "Dropbox", icon: "https://www.figma.com/api/mcp/asset/298ed4f6-3209-450d-b40b-c9620f6deaef" },
];

export default function IntegrationsPage() {
  const router = useRouter();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());

  const handleConnect = async (id: string, provider: string) => {
    setConnecting(id);
    try {
      const redirectUrl = `${window.location.origin}/sales/connect?provider=${provider}`;
      const result = await api.initiateConnection(provider, redirectUrl);
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
        return;
      }
      setConnected((prev) => new Set([...prev, id]));
    } catch {
      // ignore
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="bg-[#F9F9F9] min-h-full">
      {/* Navigation bar */}
      <div className="relative h-11 flex items-center px-6">
        <button onClick={() => router.back()} className="absolute left-6">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <p className="w-full text-center text-[16px] font-semibold">Integrations</p>
      </div>

      <div className="px-6 pt-6 flex flex-col gap-4">
        {/* Integration cards */}
        {INTEGRATIONS.map((item) => {
          const isConnected = connected.has(item.id);
          const isConnecting = connecting === item.id;

          return (
            <div
              key={item.id}
              className="bg-white rounded-[5px] flex gap-3 items-start px-4 py-3"
            >
              {/* Icon */}
              <div className="w-8 h-8 rounded-[4px] border border-[#EBEBEB] bg-white flex-shrink-0 flex items-center justify-center overflow-hidden">
                <img src={item.icon} alt={item.name} className="w-5 h-5 object-contain" />
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col gap-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] text-[#3D3D3D] leading-6">{item.name}</p>
                  {isConnected ? (
                    <p className="text-[14px] text-[#22C55E] leading-5">Connected</p>
                  ) : (
                    <button
                      onClick={() => handleConnect(item.id, item.provider)}
                      disabled={isConnecting}
                      className="text-[14px] text-[#177BE5] leading-5 disabled:opacity-50"
                    >
                      {isConnecting ? "Connecting..." : "Connect"}
                    </button>
                  )}
                </div>
                <p className="text-[15px] text-[#7A7A7A] leading-[22px] line-clamp-2">{item.description}</p>
              </div>
            </div>
          );
        })}

        {/* More apps coming soon */}
        <div className="bg-white rounded-[5px] p-4 flex flex-col gap-4">
          <div className="flex gap-2 flex-wrap">
            {MORE_APPS.map((app) => (
              <div
                key={app.name}
                className="w-8 h-8 rounded-[4px] border border-[#EBEBEB] bg-white flex items-center justify-center overflow-hidden"
              >
                <img src={app.icon} alt={app.name} className="w-5 h-5 object-contain" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 py-1">
            <p className="text-[16px] text-[#3D3D3D] leading-6">More apps coming soon</p>
            <p className="text-[14px] text-[#7A7A7A] leading-5">
              More integrations launching in 2026. Stay tuned.{" "}
              <span className="text-black underline">Request more integrations</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
