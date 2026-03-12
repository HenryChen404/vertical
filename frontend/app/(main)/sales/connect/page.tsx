"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NavBar } from "@/components/layout/nav-bar";
import { useFilterSort } from "@/components/layout/filter-sort-context";
import { api } from "@/lib/api";

const INTEGRATIONS = [
  {
    id: "google_calendar",
    label: "Connect Google Calendar",
    icon: "https://www.figma.com/api/mcp/asset/42a3f103-0a8b-4fa1-9ac9-71a62899c3af",
    provider: "google",
    isCalendar: true,
    comingSoon: false,
  },
  {
    id: "outlook_calendar",
    label: "Connect Outlook Calendar",
    icon: "https://www.figma.com/api/mcp/asset/6b12cd01-6a2a-4b22-9807-36b9897daf99",
    provider: "outlook",
    isCalendar: true,
    comingSoon: false,
  },
  {
    id: "salesforce",
    label: "Connect Salesforce",
    icon: "https://www.figma.com/api/mcp/asset/9ce60435-e1e0-4acb-bc04-da24815c7956",
    provider: "salesforce",
    isCalendar: false,
    comingSoon: false,
  },
  {
    id: "hubspot",
    label: "HubSpot",
    icon: null,
    provider: "hubspot",
    isCalendar: false,
    comingSoon: true,
  },
];

export default function SalesConnectPage() {
  return (
    <Suspense>
      <SalesConnectContent />
    </Suspense>
  );
}

function SalesConnectContent() {
  const { openModal } = useFilterSort();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState<string | null>(null);

  // On mount: check existing connection status
  useEffect(() => {
    async function checkStatus() {
      try {
        const [crm, calendar] = await Promise.all([
          api.getCrmStatus(),
          api.getCalendarStatus(),
        ]);
        const ids = new Set<string>();
        if (crm.connected && crm.provider) {
          const match = INTEGRATIONS.find((i) => i.provider === crm.provider);
          if (match) ids.add(match.id);
        }
        if (calendar.connected && calendar.provider) {
          const match = INTEGRATIONS.find((i) => i.provider === calendar.provider);
          if (match) ids.add(match.id);
        }
        if (ids.size > 0) setConnected(ids);
      } catch {
        // ignore
      }
    }
    checkStatus();
  }, []);

  // On mount: handle OAuth return (e.g. ?provider=google)
  useEffect(() => {
    const returnedProvider = searchParams.get("provider");
    if (!returnedProvider) return;

    const match = INTEGRATIONS.find((i) => i.provider === returnedProvider);
    if (!match) return;

    setVerifying(match.id);

    // Poll status a few times to wait for Composio to finalize
    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const statusFn = match.isCalendar ? api.getCalendarStatus : api.getCrmStatus;
        const status = await statusFn();
        if (status.connected) {
          setConnected((prev) => new Set([...prev, match.id]));
          setVerifying(null);
          clearInterval(interval);
          // Trigger initial sync after first authorization
          api.syncEvents(7).catch(console.error);
          router.replace("/sales");
        } else if (attempts >= maxAttempts) {
          setConnected((prev) => new Set([...prev, match.id]));
          setVerifying(null);
          clearInterval(interval);
          api.syncEvents(7).catch(console.error);
          router.replace("/sales");
        }
      } catch {
        if (attempts >= maxAttempts) {
          setVerifying(null);
          clearInterval(interval);
          router.replace("/sales");
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams, router]);

  const handleConnect = async (id: string, provider: string) => {
    setConnecting(id);
    try {
      const redirectUrl = `${window.location.origin}/sales/connect?provider=${provider}`;
      const result = await api.initiateConnection(provider, redirectUrl);

      if (result.redirect_url) {
        // Real OAuth: redirect to provider's consent screen
        // Don't reset connecting state — keep loading until page navigates away
        window.location.href = result.redirect_url;
        return;
      }

      // Fallback mock mode: instant connect
      if (result.success) {
        setConnected((prev) => new Set([...prev, id]));
        // Trigger initial sync
        api.syncEvents(7).catch(console.error);
      }
      setConnecting(null);
    } catch {
      setConnecting(null);
    }
  };

  return (
    <div className="bg-[#F9F9F9] min-h-full">
      <NavBar />
      <div className="px-6">
        {/* Title */}
        <button
          onClick={openModal}
          className="flex items-center gap-2 mt-8 pb-6 border-b border-[#EBEBEB] w-full text-left"
        >
          <h1 className="text-[44px] font-light leading-[52px]">For Sales</h1>
          <ChevronDown className="w-[18px] h-[18px] mt-1 text-black" strokeWidth={1.5} />
        </button>

        {/* Connect illustration */}
        <div className="flex flex-col items-center gap-4 mt-14 mb-10 px-4">
          {/* Chain link icon */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22 30C23.5 31.8 25.7 33 28.2 33C31.5 33 34.3 31 35.7 28.2L39.2 21.3C40.4 18.9 40.4 16 39.2 13.6C37.6 10.5 34.3 8.5 30.7 8.5C27.4 8.5 24.4 10.2 22.8 12.9L20.5 16.9"
              stroke="#1A1A1A"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <path
              d="M30 22C28.5 20.2 26.3 19 23.8 19C20.5 19 17.7 21 16.3 23.8L12.8 30.7C11.6 33.1 11.6 36 12.8 38.4C14.4 41.5 17.7 43.5 21.3 43.5C24.6 43.5 27.6 41.8 29.2 39.1L31.5 35.1"
              stroke="#1A1A1A"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>

          <h2 className="text-[20px] font-semibold text-[#1A1A1A] text-center leading-7">
            Connect your tools
          </h2>
          <p className="text-[14px] text-[#7A7A7A] text-center leading-5 max-w-[280px]">
            Link your calendar and CRM to track meetings, sync deals, and update records with AI-extracted insights.
          </p>
        </div>

        {/* Integration buttons */}
        <div className="flex flex-col gap-3 pb-8">
          {INTEGRATIONS.map((item) => {
            const isConnected = connected.has(item.id);
            const isConnecting = connecting === item.id;
            const isVerifying = verifying === item.id;
            if (item.comingSoon) {
              return (
                <button
                  key={item.id}
                  disabled
                  className="w-full h-[52px] bg-[#F5F5F5] rounded-[10px] flex items-center px-4 gap-3 opacity-60"
                >
                  {/* HubSpot placeholder icon */}
                  <div className="w-6 h-6 rounded-md bg-[#FF7A59] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[11px] font-bold">H</span>
                  </div>
                  <span className="text-[15px] text-[#3D3D3D] flex-1 text-left">{item.label}</span>
                  <span className="text-[12px] text-[#A3A3A3]">Coming soon</span>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => !isConnected && !isVerifying && handleConnect(item.id, item.provider)}
                disabled={isConnecting || isVerifying}
                className={`w-full h-[52px] rounded-[10px] flex items-center px-4 gap-3 border transition-colors ${
                  isConnected
                    ? "bg-white border-[#22C55E]"
                    : "bg-white border-[#EBEBEB] active:bg-[#F9F9F9]"
                } disabled:opacity-50`}
              >
                <img
                  src={item.icon!}
                  alt={item.label}
                  className="w-6 h-6 object-contain flex-shrink-0"
                />
                <span className={`text-[15px] flex-1 text-left ${isConnected ? "text-[#22C55E]" : "text-[#3D3D3D]"}`}>
                  {isConnected
                    ? "Connected"
                    : isVerifying
                      ? "Verifying..."
                      : isConnecting
                        ? "Connecting..."
                        : item.label}
                </span>
                {isConnected && (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3.5 9L7.5 13L14.5 5" stroke="#22C55E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
