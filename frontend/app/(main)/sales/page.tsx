"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, X, Check, CheckCircle2 } from "lucide-react";
import { NavBar } from "@/components/layout/nav-bar";
import { useFilterSort } from "@/components/layout/filter-sort-context";
import { api } from "@/lib/api";
import type { CalendarEvent, DealListItem, UnsyncedRecording } from "@/lib/types";

const INTEGRATION_ICONS = [
  { name: "Google Calendar", icon: "/icons/google-calendar.svg" },
  { name: "Outlook Calendar", icon: "/icons/outlook.svg" },
  { name: "Salesforce", icon: "/icons/salesforce.svg" },
];

function formatTime(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function isToday(isoStr: string): boolean {
  const d = new Date(isoStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function isTomorrow(isoStr: string): boolean {
  const d = new Date(isoStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.toDateString() === tomorrow.toDateString();
}

function EventRow({ event, isLast }: { event: CalendarEvent; isLast: boolean }) {
  const sales = event.sales_details;
  const accountName = sales?.account?.name;
  const oppName = sales?.opportunity?.name;
  const subtitle = [accountName, oppName].filter(Boolean).join(" ｜ ");

  return (
    <Link
      href={`/schedule/${event.id}`}
      className={`flex flex-col gap-1 ${isLast ? "" : "pb-5 border-b border-[#EBEBEB]"}`}
    >
      <p className="text-[13px] text-[#7A7A7A] leading-4">
        {formatTime(event.start_time)} - {formatTime(event.end_time)}
      </p>
      <p className="text-[16px] text-[#3D3D3D] leading-6">{event.title}</p>
      {subtitle ? (
        <p className="text-[13px] text-[#7A7A7A] leading-4">{subtitle}</p>
      ) : event.location ? (
        <p className="text-[13px] text-[#7A7A7A] leading-4">{event.location}</p>
      ) : null}
    </Link>
  );
}

function EventGroup({ label, events: groupEvents }: { label: string; events: CalendarEvent[] }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[13px] font-semibold text-[#3D3D3D]">{label}</p>
      <div className="flex flex-col gap-5">
        {groupEvents.map((e, i) => (
          <EventRow key={e.id} event={e} isLast={i === groupEvents.length - 1} />
        ))}
      </div>
    </div>
  );
}

type BannerState = "connect" | "update" | "uptodate" | "hidden";

function StatusBanner({
  state,
  unsyncedCount,
  onDismiss,
  onUpdate,
}: {
  state: BannerState;
  unsyncedCount: number;
  onDismiss: () => void;
  onUpdate?: () => void;
}) {
  const router = useRouter();

  if (state === "hidden") return null;

  if (state === "connect") {
    return (
      <div className="bg-white rounded-[5px] relative overflow-hidden pt-8 pb-3 px-3">
        <div className="absolute top-[-12px] left-3 flex gap-1">
          {INTEGRATION_ICONS.map((item) => (
            <div
              key={item.name}
              className="w-8 h-8 rounded-[4px] border border-[#EBEBEB] bg-white flex items-center justify-center overflow-hidden"
            >
              <img src={item.icon} alt={item.name} className="w-5 h-5 object-contain" />
            </div>
          ))}
        </div>
        <div className="absolute top-[-2px] left-3 w-[104px] h-[22px] bg-gradient-to-b from-white via-white/70 to-transparent" />
        <button onClick={onDismiss} className="absolute top-2 right-3">
          <X className="w-6 h-6 text-[#7A7A7A]" strokeWidth={1.5} />
        </button>
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-5 text-[#3D3D3D] w-[292px]">
            Connect more tools to unlock the full experience
          </p>
          <button
            onClick={() => router.push("/integration")}
            className="bg-black text-white text-[14px] font-semibold leading-5 h-8 px-4 rounded-[5px] self-start"
          >
            Connect tools
          </button>
        </div>
      </div>
    );
  }

  if (state === "update") {
    return (
      <div className="bg-white rounded-[5px] flex items-center gap-4 p-3">
        <div className="flex items-center gap-2 flex-1">
          <Image src="/icons/icon-crm-update.svg" alt="" width={24} height={24} className="shrink-0" />
          <p className="text-[14px] leading-5 text-[#3D3D3D]">
            {unsyncedCount} new file{unsyncedCount !== 1 ? "s are" : " is"} ready to update your CRM
          </p>
        </div>
        <button
          onClick={onUpdate}
          className="bg-black text-white text-[14px] font-semibold leading-5 h-8 px-4 rounded-[5px] shrink-0 flex items-center"
        >
          Update
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[5px] flex items-center justify-between p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="w-6 h-6 text-[#22C55E] shrink-0" strokeWidth={1.5} />
        <p className="text-[14px] leading-5 text-[#3D3D3D]">
          All files are up to date in your CRM.
        </p>
      </div>
      <button onClick={onDismiss}>
        <X className="w-4 h-4 text-[#7A7A7A]" strokeWidth={2} />
      </button>
    </div>
  );
}

function formatAmount(amount: number | null): string {
  if (amount === null || amount === undefined) return "";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}k`;
  return `$${amount.toLocaleString()}`;
}

function DealRow({ deal, isLast }: { deal: DealListItem; isLast: boolean }) {
  const parts = [deal.account?.name, deal.stage, formatAmount(deal.amount)].filter(Boolean);
  return (
    <Link
      href={`/deals/${deal.id}`}
      className={`flex flex-col gap-1 ${isLast ? "" : "pb-5 border-b border-[#EBEBEB]"}`}
    >
      <p className="text-[16px] text-[#3D3D3D] leading-6">{deal.name}</p>
      {parts.length > 0 && (
        <p className="text-[13px] text-[#7A7A7A] leading-4">{parts.join(" ｜ ")}</p>
      )}
    </Link>
  );
}

function DealsList() {
  const [deals, setDeals] = useState<DealListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDeals().then((d) => {
      setDeals(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="pt-8 text-center">
        <p className="text-[14px] text-[#7A7A7A]">Loading deals...</p>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center gap-3 py-20">
        <Image src="/icons/empty-calendar.svg" alt="" width={52} height={52} />
        <p className="text-[20px] text-[#7A7A7A] leading-7">No deals yet</p>
        <p className="text-[13px] text-[#7A7A7A] leading-4 text-center">
          Deals from your CRM will be listed here
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 mt-5">
      {deals.map((d, i) => (
        <DealRow key={d.id} deal={d} isLast={i === deals.length - 1} />
      ))}
    </div>
  );
}

export default function SalesPage() {
  const [activeTab, setActiveTab] = useState<"schedule" | "deals">("schedule");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { openModal } = useFilterSort();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [showSelectSheet, setShowSelectSheet] = useState(false);

  useEffect(() => {
    async function loadEvents() {
      try {
        const { events: data } = await api.getEvents("week");
        if (data.length === 0) {
          // No events yet — trigger sync in case data hasn't been pulled
          try {
            await api.syncEvents(7);
            const { events: refreshed } = await api.getEvents("week");
            setEvents(refreshed);
          } catch {
            setEvents(data);
          }
        } else {
          setEvents(data);
        }
      } catch (e) {
        console.error("Failed to load events:", e);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();

    // Determine banner state
    async function checkBanner() {
      try {
        const crm = await api.getCrmStatus();
        if (!crm.connected) {
          setBannerState("connect");
          return;
        }
        // CRM connected — check for unsynced recordings
        const recordings = await api.getUnsyncedRecordings();
        if (recordings.length > 0) {
          setUnsyncedCount(recordings.length);
          setBannerState("update");
        } else {
          setBannerState("uptodate");
        }
      } catch {
        // Silently fail
      }
    }
    checkBanner();
  }, []);

  // Group events by day
  const todayEvents = events.filter((e) => isToday(e.start_time));
  const tomorrowEvents = events.filter((e) => isTomorrow(e.start_time));
  const laterEvents = events.filter((e) => !isToday(e.start_time) && !isTomorrow(e.start_time));

  // Group later events by date
  const laterByDate = laterEvents.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = formatDate(e.start_time);
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  const hasEvents = events.length > 0;
  const isEmpty = !loading && !hasEvents;

  return (
    <div className="flex flex-col bg-[#F9F9F9] min-h-full">
      <NavBar />
      <div className="flex flex-col flex-1 px-6">
        {/* Title */}
        <div className="mt-8">
          <button onClick={openModal} className="flex items-center gap-2">
            <h1 className="text-[44px] font-light leading-[52px]">For Sales</h1>
            <ChevronDown className="w-[18px] h-[18px] mt-1 text-black" strokeWidth={1.5} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#EBEBEB] mt-4" />

        {/* Tabs */}
        <div className="flex gap-6">
          <button
            className={`pt-4 pb-0.5 text-[14px] font-semibold ${activeTab === "schedule" ? "text-black border-b-2 border-black" : "text-[#A3A3A3]"}`}
            onClick={() => setActiveTab("schedule")}
          >
            Schedule
          </button>
          <button
            className={`pt-4 pb-0.5 text-[14px] font-semibold ${activeTab === "deals" ? "text-black border-b-2 border-black" : "text-[#A3A3A3]"}`}
            onClick={() => setActiveTab("deals")}
          >
            Deals
          </button>
        </div>

        {activeTab === "deals" ? (
          <DealsList />
        ) : isEmpty ? (
          /* Empty state — vertically centered with feedback at bottom */
          <div className="flex flex-col flex-1 items-center justify-center -mt-16">
            <div className="flex flex-col items-center gap-3">
              <Image src="/icons/empty-calendar.svg" alt="" width={52} height={52} />
              <div className="flex flex-col items-center gap-2">
                <p className="text-[20px] text-[#7A7A7A] leading-7">
                  No upcoming meetings
                </p>
                <p className="text-[13px] text-[#7A7A7A] leading-4 text-center">
                  The scheduled meetings will be listed here
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Normal state with events */
          <>
            {/* Status banner */}
            <div className="mt-5">
              <StatusBanner
                state={bannerState}
                unsyncedCount={unsyncedCount}
                onDismiss={() => setBannerState("hidden")}
                onUpdate={() => setShowSelectSheet(true)}
              />
            </div>

            {/* Loading state */}
            {loading && (
              <div className="pt-8 text-center">
                <p className="text-[14px] text-[#7A7A7A]">Loading events...</p>
              </div>
            )}

            <div className="flex flex-col gap-8 mt-5">
              {todayEvents.length > 0 && (
                <EventGroup label="Today" events={todayEvents} />
              )}
              {tomorrowEvents.length > 0 && (
                <EventGroup label="Tomorrow" events={tomorrowEvents} />
              )}
              {Object.entries(laterByDate).map(([date, dateEvents]) => (
                <EventGroup key={date} label={date} events={dateEvents} />
              ))}
            </div>

          </>
        )}

        {/* Send feedback */}
        <div className="py-8 text-center mt-auto">
          <p className="text-[13px] text-[#A3A3A3]">Send feedback</p>
        </div>
      </div>

      {/* Select Recordings Sheet */}
      {showSelectSheet && (
        <SelectRecordingsSheet onClose={() => setShowSelectSheet(false)} />
      )}
    </div>
  );
}

// --- Select Recordings Bottom Sheet ---

function SelectRecordingsSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [recordings, setRecordings] = useState<UnsyncedRecording[]>([]);
  const [creating, setCreating] = useState(false);
  const [showDontSyncDialog, setShowDontSyncDialog] = useState(false);

  useEffect(() => {
    api.getUnsyncedRecordings().then(setRecordings).catch(console.error);
  }, []);

  const toggle = (id: string) => {
    setRecordings((prev) =>
      prev.map((r) => (r.id === id ? { ...r, selected: !r.selected } : r))
    );
  };

  const allSelected =
    recordings.length > 0 && recordings.every((r) => r.selected);

  const toggleAll = () => {
    const newVal = !allSelected;
    setRecordings((prev) => prev.map((r) => ({ ...r, selected: newVal })));
  };

  const selectedIds = recordings.filter((r) => r.selected).map((r) => r.id);
  const selectedCount = selectedIds.length;

  const handleContinue = async () => {
    if (selectedCount === 0 || creating) return;
    setCreating(true);
    try {
      const workflow = await api.createWorkflow(selectedIds);
      sessionStorage.setItem("crm_workflow_id", workflow.id);
      onClose();
      router.push("/update-crm/review");
    } catch (e) {
      console.error("Failed to create workflow:", e);
      setCreating(false);
    }
  };

  const handleRemove = () => {
    setShowDontSyncDialog(false);
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet — ~8/9 of screen */}
      <div className="relative bg-white rounded-t-2xl flex flex-col animate-slide-up" style={{ height: "88%" }}>
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-[#D0D0D0]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-2">
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center -ml-2"
          >
            <X className="w-5 h-5 text-black" />
          </button>
          <h1 className="text-[16px] font-semibold text-black">
            Select Recordings
          </h1>
          <button
            onClick={toggleAll}
            className="text-[16px] font-normal text-[#177BE5]"
          >
            {allSelected ? "Unselect all" : "Select all"}
          </button>
        </div>

        {/* Subtitle */}
        <p className="text-[14px] font-semibold text-[#A3A3A3] px-6 pb-3">
          {recordings.length} Unsynced Recording{recordings.length !== 1 && "s"}
        </p>

        {/* Recording list */}
        <div className="flex-1 overflow-y-auto px-6">
          {recordings.map((rec, i) => (
            <div key={rec.id}>
              {i > 0 && <div className="h-px bg-[#F0F0F0]" />}
              <button
                onClick={() => toggle(rec.id)}
                className={`w-full flex items-center gap-3 py-4 text-left ${!rec.selected ? "opacity-70" : ""}`}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-[16px] font-normal text-[#3D3D3D] leading-6 line-clamp-2">
                    {rec.title}
                  </p>
                  {(rec.date || rec.duration) && (
                    <p className="text-[13px] font-normal text-[#7A7A7A] leading-4">
                      {rec.date}{rec.date && rec.duration ? " ｜ " : ""}{rec.duration}
                    </p>
                  )}
                  {rec.crm_tags && rec.crm_tags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      {rec.crm_tags.map((tag) => (
                        <span
                          key={tag.label}
                          className="inline-block px-2 py-1 bg-[#EBEBEB] rounded-[2px] text-[11px] text-[#7A7A7A] leading-[13px]"
                        >
                          {tag.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Circle checkbox */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                    rec.selected
                      ? "bg-black"
                      : "border-[1.5px] border-[#D0D0D0]"
                  }`}
                >
                  {rec.selected && (
                    <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>

        {/* Bottom buttons */}
        {selectedCount > 0 && (
          <div className="px-4 pt-3 pb-8 shrink-0">
            <button
              onClick={handleContinue}
              disabled={creating}
              className="w-full py-[12px] bg-black text-white rounded-[5px] text-[16px] font-semibold disabled:opacity-40"
            >
              {creating ? "Creating..." : `Continue (${selectedCount})`}
            </button>
            <button
              onClick={() => setShowDontSyncDialog(true)}
              className="w-full py-3 text-[16px] text-black font-normal text-center"
            >
              Don&apos;t sync
            </button>
          </div>
        )}

        {/* "Don't sync" confirmation dialog */}
        {showDontSyncDialog && (
          <div className="absolute inset-0 z-50 flex items-end">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setShowDontSyncDialog(false)}
            />
            <div className="relative w-full bg-white rounded-t-[5px] flex flex-col">
              {/* Header */}
              <div className="px-6 pt-4 pb-4 border-b border-[#EBEBEB]">
                <div className="flex items-start gap-4">
                  <h2 className="flex-1 text-[28px] font-light leading-8 text-black">
                    Remove from CRM updates
                  </h2>
                  <button
                    onClick={() => setShowDontSyncDialog(false)}
                    className="w-8 h-8 flex items-center justify-center shrink-0"
                  >
                    <X className="w-6 h-6 text-black" />
                  </button>
                </div>
              </div>
              {/* Body */}
              <div className="px-6 py-6">
                <p className="text-[16px] text-[#3D3D3D] leading-6">
                  Selected recordings will be removed from CRM updates.{" "}
                  <span className="font-semibold">
                    This action cannot be undone.
                  </span>{" "}
                  They will remain saved in your library.
                </p>
              </div>
              {/* Buttons */}
              <div className="flex gap-3 px-6 pt-2 pb-4">
                <button
                  onClick={() => setShowDontSyncDialog(false)}
                  className="flex-1 py-[12px] border border-[#ADADAD] rounded-[5px] text-[16px] font-normal text-black"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemove}
                  className="flex-1 py-[12px] bg-black text-white rounded-[5px] text-[16px] font-semibold"
                >
                  Remove
                </button>
              </div>
              {/* Safe area */}
              <div className="h-[34px]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
