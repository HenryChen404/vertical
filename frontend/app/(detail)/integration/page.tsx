"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";

const INTEGRATIONS = [
  {
    id: "google_calendar",
    label: "Google Calendar",
    description: "Link to access upcoming meetings and meeting details.",
    icon: "https://www.figma.com/api/mcp/asset/42a3f103-0a8b-4fa1-9ac9-71a62899c3af",
    provider: "google",
    isCalendar: true,
  },
  {
    id: "outlook_calendar",
    label: "Outlook Calendar",
    description: "Link to access upcoming meetings and meeting details.",
    icon: "https://www.figma.com/api/mcp/asset/6b12cd01-6a2a-4b22-9807-36b9897daf99",
    provider: "outlook",
    isCalendar: true,
  },
  {
    id: "salesforce",
    label: "Salesforce",
    description:
      "Sync meeting insights to update contacts and activities in Salesforce.",
    icon: "https://www.figma.com/api/mcp/asset/9ce60435-e1e0-4acb-bc04-da24815c7956",
    provider: "salesforce",
    isCalendar: false,
  },
];

const MORE_APPS = [
  { name: "Slack", icon: "https://www.figma.com/api/mcp/asset/d7c0b27f-dd01-4101-ab28-94188ece79d1" },
  { name: "OneNote", icon: "https://www.figma.com/api/mcp/asset/79833ec0-38e2-4df3-be03-b4d620d21a7c" },
  { name: "Google Docs", icon: "https://www.figma.com/api/mcp/asset/942f5c49-615b-4022-8936-52d2ea17ba3e" },
  { name: "Notion", icon: "https://www.figma.com/api/mcp/asset/f2fca67f-273c-4883-bc09-7cfdfcf3f544" },
  { name: "MS Teams", icon: "https://www.figma.com/api/mcp/asset/991dd3a5-b3fd-471f-b125-00f3dd086c0d" },
  { name: "Zapier", icon: "https://www.figma.com/api/mcp/asset/96ddea46-1c02-4144-8a64-7aa5c3e0bb55" },
  { name: "Google Drive", icon: "https://www.figma.com/api/mcp/asset/a1f3efb5-ed72-414b-aec1-8edec364534e" },
  { name: "Dropbox", icon: "https://www.figma.com/api/mcp/asset/846bdd97-15b6-4fa8-acd8-1fe6ef9ed969" },
];

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsContent />
    </Suspense>
  );
}

function IntegrationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [apiError, setApiError] = useState<Record<string, string>>({});

  // Check existing connection status on mount
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
          const match = INTEGRATIONS.find(
            (i) => i.provider === calendar.provider
          );
          if (match) ids.add(match.id);
        }
        if (ids.size > 0) setConnected(ids);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    checkStatus();
  }, []);

  // Handle OAuth return via ?provider= query param
  useEffect(() => {
    const returnedProvider = searchParams.get("provider");
    if (!returnedProvider) return;

    const match = INTEGRATIONS.find((i) => i.provider === returnedProvider);
    if (!match) return;

    setVerifying(match.id);

    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const statusFn = match.isCalendar
          ? api.getCalendarStatus
          : api.getCrmStatus;
        const status = await statusFn();
        if (status.connected || attempts >= maxAttempts) {
          setConnected((prev) => new Set([...prev, match.id]));
          clearInterval(interval);

          // Verify API access after connection confirmed
          try {
            const verify = await api.verifyApiAccess(match.provider);
            if (!verify.api_enabled) {
              // Auto-disconnect and revert to Connect state
              await api.disconnectProvider(match.provider);
              setConnected((prev) => {
                const next = new Set(prev);
                next.delete(match.id);
                return next;
              });
              setApiError((prev) => ({
                ...prev,
                [match.id]: verify.error || "API is not enabled for this organization.",
              }));
            }
          } catch {
            // Verification failed, don't block — just skip
          }

          setVerifying(null);
          router.replace("/integration");
        }
      } catch {
        if (attempts >= maxAttempts) {
          setVerifying(null);
          clearInterval(interval);
          router.replace("/integration");
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams, router]);

  const handleConnect = async (item: (typeof INTEGRATIONS)[number]) => {
    setConnecting(item.id);
    try {
      const redirectUrl = `${window.location.origin}/integration?provider=${item.provider}`;
      const result = await api.initiateConnection(item.provider, redirectUrl);

      if (result.redirect_url) {
        window.location.href = result.redirect_url;
        return;
      }

      // Fallback mock mode
      if (result.success) {
        setConnected((prev) => new Set([...prev, item.id]));
        // Verify API access
        try {
          const verify = await api.verifyApiAccess(item.provider);
          if (!verify.api_enabled) {
            await api.disconnectProvider(item.provider);
            setConnected((prev) => {
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
            setApiError((prev) => ({
              ...prev,
              [item.id]: verify.error || "API is not enabled for this organization.",
            }));
          }
        } catch {
          // skip
        }
      }
    } catch {
      // ignore
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (item: (typeof INTEGRATIONS)[number]) => {
    setDisconnecting(item.id);
    try {
      await api.disconnectProvider(item.provider);
      setConnected((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      setApiError((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch {
      // ignore
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="flex flex-col flex-1 overflow-auto bg-[#F9F9F9]">
      <BackHeader title="Integrations" fallbackHref="/explore" />

      <div className="flex flex-col gap-4 px-6 pt-6">
        {/* Integration cards */}
        {INTEGRATIONS.map((item) => {
          const isConnected = connected.has(item.id);
          const isConnecting = connecting === item.id;
          const isDisconnecting = disconnecting === item.id;
          const isVerifying = verifying === item.id;
          const itemApiError = apiError[item.id];

          return (
            <div
              key={item.id}
              className="bg-white rounded-[5px] flex flex-col px-4 py-3"
            >
              <div className="flex gap-3 items-start">
              {/* Icon */}
              <div className="w-8 h-8 rounded-[4px] border border-[#EBEBEB] overflow-hidden flex-shrink-0 flex items-center justify-center bg-white">
                <img
                  src={item.icon}
                  alt={item.label}
                  className="w-5 h-5 object-contain"
                />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <p className="text-[16px] leading-6 text-[#3D3D3D]">
                    {item.label}
                  </p>
                  {loading ? (
                    <span className="text-[14px] leading-5 text-[#7A7A7A]">—</span>
                  ) : isVerifying ? (
                    <span className="text-[14px] leading-5 text-[#7A7A7A]">
                      Verifying...
                    </span>
                  ) : isConnecting ? (
                    <span className="text-[14px] leading-5 text-[#7A7A7A]">
                      Connecting...
                    </span>
                  ) : isDisconnecting ? (
                    <span className="text-[14px] leading-5 text-[#7A7A7A]">
                      Disconnecting...
                    </span>
                  ) : isConnected ? (
                    <button
                      onClick={() => handleDisconnect(item)}
                      className="text-[14px] leading-5 text-[#177BE5] text-right"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(item)}
                      className="text-[14px] leading-5 text-[#177BE5] text-right"
                    >
                      Connect
                    </button>
                  )}
                </div>
                <p className="text-[14px] leading-[20px] text-[#7A7A7A]">
                  {item.description}
                </p>
              </div>
              </div>
              {itemApiError && (
                <div className="mt-2 px-2 py-2 bg-[#FFF3F3] rounded-[4px]">
                  <p className="text-[13px] leading-[18px] text-[#D32F2F]">
                    API is not enabled for this organization. Please use a Salesforce Developer or Enterprise edition.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* More apps coming soon */}
      <div className="mt-auto px-6 pb-8">
        <div className="bg-white rounded-[5px] p-4 flex flex-col gap-4">
          {/* App icons row */}
          <div className="flex gap-2 overflow-hidden">
            {MORE_APPS.map((app) => (
              <div
                key={app.name}
                className="w-8 h-8 rounded-[4px] border border-[#EBEBEB] overflow-hidden flex-shrink-0 flex items-center justify-center bg-white"
              >
                <img
                  src={app.icon}
                  alt={app.name}
                  className="w-5 h-5 object-contain"
                />
              </div>
            ))}
          </div>

          {/* Text */}
          <div className="flex flex-col gap-1 py-1">
            <p className="text-[16px] leading-6 text-[#3D3D3D]">
              More apps coming soon
            </p>
            <p className="text-[14px] leading-5 text-[#7A7A7A]">
              More integrations launching in 2026. Stay tuned.{" "}
              <span className="text-black underline">
                Request more integrations
              </span>
            </p>
          </div>
        </div>

        {/* Footnote */}
        <p className="text-[12px] text-[#7A7A7A] mt-4 px-6">
          *Integrations require enabling Private Cloud Sync.
        </p>
      </div>
    </div>
  );
}
