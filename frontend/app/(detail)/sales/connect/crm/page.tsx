"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";

const SALESFORCE_ICON =
  "https://www.figma.com/api/mcp/asset/9ce60435-e1e0-4acb-bc04-da24815c7956";
const GOOGLE_CALENDAR_ICON =
  "https://www.figma.com/api/mcp/asset/42a3f103-0a8b-4fa1-9ac9-71a62899c3af";
const OUTLOOK_ICON =
  "https://www.figma.com/api/mcp/asset/6b12cd01-6a2a-4b22-9807-36b9897daf99";

export default function ConnectToolsPage() {
  return (
    <Suspense>
      <ConnectToolsContent />
    </Suspense>
  );
}

/** Black toast at top — auto-dismiss after 4s */
function ErrorToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="absolute top-[60px] left-6 right-6 z-50">
      <div className="bg-black rounded-[10px] px-4 py-3">
        <p className="text-[14px] leading-5 text-white">{message}</p>
      </div>
    </div>
  );
}

function ConnectToolsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Loading state — true until initial status check completes
  const [statusLoaded, setStatusLoaded] = useState(false);

  // CRM state
  const [crmConnecting, setCrmConnecting] = useState(false);
  const [crmVerifying, setCrmVerifying] = useState(false);
  const [crmConnected, setCrmConnected] = useState(false);

  // Calendar state
  const [calConnecting, setCalConnecting] = useState<string | null>(null);
  const [calVerifying, setCalVerifying] = useState<string | null>(null);
  const [calConnected, setCalConnected] = useState<string | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const dismissToast = useCallback(() => setToastMessage(null), []);

  // Check existing connection status on mount
  useEffect(() => {
    async function checkStatus() {
      try {
        const [crm, calendar] = await Promise.all([
          api.getCrmStatus(),
          api.getCalendarStatus(),
        ]);
        if (crm.connected) setCrmConnected(true);
        if (calendar.connected && calendar.provider) setCalConnected(calendar.provider);
      } catch {
        // ignore
      } finally {
        setStatusLoaded(true);
      }
    }
    checkStatus();
  }, []);

  // Handle OAuth return (?provider=xxx)
  const returnedProvider = searchParams.get("provider");
  const isOAuthReturn = !!returnedProvider;

  useEffect(() => {
    if (!returnedProvider) return;

    const isCrm = returnedProvider === "salesforce";
    if (isCrm) {
      setCrmVerifying(true);
    } else {
      setCalVerifying(returnedProvider);
    }

    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const statusFn = isCrm ? api.getCrmStatus : api.getCalendarStatus;
        const status = await statusFn();

        if (status.connected || attempts >= maxAttempts) {
          clearInterval(interval);

          if (status.connected) {
            if (isCrm) {
              // Verify API access for Salesforce
              try {
                const verify = await api.verifyApiAccess("salesforce");
                if (!verify.api_enabled) {
                  await api.disconnectProvider("salesforce");
                  setToastMessage(
                    "Salesforce connection has been disconnected. Please try again."
                  );
                  setCrmVerifying(false);
                  router.replace("/sales/connect/crm");
                  return;
                }
              } catch {
                // skip verification failure
              }
              setCrmConnected(true);
              setCrmVerifying(false);
            } else {
              setCalConnected(returnedProvider);
              setCalVerifying(null);
            }
            // Trigger sync
            try { await api.syncEvents(7); } catch {}
          } else {
            // Connection failed
            const name = isCrm ? "Salesforce" : returnedProvider === "google" ? "Google Calendar" : "Outlook Calendar";
            setToastMessage(`${name} connection failed. Please try again.`);
            if (isCrm) setCrmVerifying(false);
            else setCalVerifying(null);
          }
          router.replace("/sales/connect/crm");
        }
      } catch {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          if (isCrm) setCrmVerifying(false);
          else setCalVerifying(null);
          setToastMessage("Connection failed. Please try again.");
          router.replace("/sales/connect/crm");
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [searchParams, router]);

  // Connect handlers — set state synchronously, then navigate
  const handleCrmConnect = () => {
    setCrmConnecting(true);
    const callbackUrl = `${window.location.origin}/sales/connect/crm?provider=salesforce`;
    window.location.href = api.getConnectRedirectUrl("salesforce", callbackUrl);
  };

  const handleCalConnect = (provider: string) => {
    setCalConnecting(provider);
    const callbackUrl = `${window.location.origin}/sales/connect/crm?provider=${provider}`;
    window.location.href = api.getConnectRedirectUrl(provider, callbackUrl);
  };

  const showSkeleton = !statusLoaded && !isOAuthReturn;

  const crmLabel = crmVerifying
    ? "Verifying..."
    : crmConnecting
      ? "Connecting..."
      : "Connect Salesforce";

  const isCalDisabled =
    calConnecting !== null || calVerifying !== null || calConnected !== null;

  const calLabel = (provider: string) => {
    if (calVerifying === provider) return "Verifying...";
    if (calConnecting === provider) return "Connecting...";
    if (provider === "google") return "Connect Google Calendar";
    return "Connect Outlook Calendar";
  };

  return (
    <div className="relative flex flex-col flex-1 overflow-auto bg-[#F9F9F9]">
      <BackHeader title="Connect tools" fallbackHref="/sales/connect" />

      {/* Error toast */}
      {toastMessage && (
        <ErrorToast message={toastMessage} onDismiss={dismissToast} />
      )}

      <div className="flex flex-col flex-1 gap-14 px-6 pt-8">
        {/* Step 1: Connect CRM */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center">
              <span className="text-[14px] leading-5 text-black">1</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-[20px] leading-7 text-black">Connect CRM</h2>
              <p className="text-[14px] leading-5 text-[#7A7A7A]">
                Connect CRM to sync deals and update records with AI-extracted insights.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Salesforce */}
            {showSkeleton ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-center bg-[#F2F2F2] animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={SALESFORCE_ICON} alt="Salesforce" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-[#999]">Salesforce</span>
                </div>
              </div>
            ) : crmConnected ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-between bg-[#F2F2F2]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={SALESFORCE_ICON} alt="Salesforce" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-black">Salesforce</span>
                </div>
                <img src="/icons/icon-check.svg" alt="Connected" className="w-6 h-6" />
              </div>
            ) : (
              <button
                onClick={handleCrmConnect}
                disabled={crmConnecting || crmVerifying}
                className="w-full py-3 px-6 rounded-[5px] flex items-center justify-center gap-2 border border-[#ADADAD] bg-white active:bg-[#F5F5F5] disabled:opacity-60 cursor-pointer disabled:cursor-default"
              >
                <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                  <img src={SALESFORCE_ICON} alt="Salesforce" className="w-5 h-5 object-contain" />
                </div>
                <span className="text-[16px] leading-6 text-black">{crmLabel}</span>
              </button>
            )}

            {/* HubSpot — coming soon */}
            <div className="w-full py-3 px-6 rounded-[5px] flex items-center justify-center gap-2 bg-[#F2F2F2]">
              <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                <img src="/icons/hubspot-icon.svg" alt="HubSpot" className="w-5 h-5 object-contain" />
              </div>
              <span className="text-[16px] leading-6 text-[#3D3D3D]">Hubspot</span>
              <span className="text-[14px] leading-5 text-[#A3A3A3]">Coming soon</span>
            </div>
          </div>
        </div>

        {/* Step 2: Connect Calendar (optional) */}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="w-8 h-8 rounded-full border border-black flex items-center justify-center">
              <span className="text-[14px] leading-5 text-black">2</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-[20px] leading-7 text-black">
                Connect Calendar <span className="text-[#7A7A7A]">(optional)</span>
              </h2>
              <p className="text-[14px] leading-5 text-[#7A7A7A]">
                Connect at least one calendar to sync your meetings.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {/* Google Calendar */}
            {showSkeleton ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-center bg-[#F2F2F2] animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={GOOGLE_CALENDAR_ICON} alt="Google Calendar" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-[#999]">Google Calendar</span>
                </div>
              </div>
            ) : calConnected === "google" ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-between bg-[#F2F2F2]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={GOOGLE_CALENDAR_ICON} alt="Google Calendar" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-black">Google Calendar</span>
                </div>
                <img src="/icons/icon-check.svg" alt="Connected" className="w-6 h-6" />
              </div>
            ) : (
              <button
                onClick={() => handleCalConnect("google")}
                disabled={isCalDisabled}
                className="w-full py-3 px-6 rounded-[5px] flex items-center justify-center gap-2 border border-[#ADADAD] bg-white active:bg-[#F5F5F5] disabled:opacity-60 cursor-pointer disabled:cursor-default"
              >
                <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                  <img src={GOOGLE_CALENDAR_ICON} alt="Google Calendar" className="w-5 h-5 object-contain" />
                </div>
                <span className="text-[16px] leading-6 text-black">{calLabel("google")}</span>
              </button>
            )}

            {/* Outlook Calendar */}
            {showSkeleton ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-center bg-[#F2F2F2] animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={OUTLOOK_ICON} alt="Outlook Calendar" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-[#999]">Outlook Calendar</span>
                </div>
              </div>
            ) : calConnected === "outlook" ? (
              <div className="w-full py-3 px-4 rounded-[5px] flex items-center justify-between bg-[#F2F2F2]">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                    <img src={OUTLOOK_ICON} alt="Outlook Calendar" className="w-5 h-5 object-contain" />
                  </div>
                  <span className="text-[16px] leading-6 text-black">Outlook Calendar</span>
                </div>
                <img src="/icons/icon-check.svg" alt="Connected" className="w-6 h-6" />
              </div>
            ) : (
              <button
                onClick={() => handleCalConnect("outlook")}
                disabled={isCalDisabled}
                className="w-full py-3 px-6 rounded-[5px] flex items-center justify-center gap-2 border border-[#ADADAD] bg-white active:bg-[#F5F5F5] disabled:opacity-60 cursor-pointer disabled:cursor-default"
              >
                <div className="w-6 h-6 rounded-[4px] flex items-center justify-center flex-shrink-0">
                  <img src={OUTLOOK_ICON} alt="Outlook Calendar" className="w-5 h-5 object-contain" />
                </div>
                <span className="text-[16px] leading-6 text-black">{calLabel("outlook")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* View meetings button — shown when CRM is connected */}
      {statusLoaded && crmConnected && (
        <div className="px-6 pb-8 pt-4">
          <button
            onClick={() => router.push("/sales")}
            className="w-full py-3 bg-black text-white text-[16px] font-semibold leading-6 rounded-[5px]"
          >
            View meetings
          </button>
        </div>
      )}
    </div>
  );
}
