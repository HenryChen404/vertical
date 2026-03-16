"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronDown, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { NavBar } from "@/components/layout/nav-bar";
import { useFilterSort } from "@/components/layout/filter-sort-context";
import { api } from "@/lib/api";
import type { CalendarEvent } from "@/lib/types";

const INTEGRATION_ICONS = [
  { name: "Google Calendar", icon: "https://www.figma.com/api/mcp/asset/42a3f103-0a8b-4fa1-9ac9-71a62899c3af" },
  { name: "Outlook Calendar", icon: "https://www.figma.com/api/mcp/asset/6b12cd01-6a2a-4b22-9807-36b9897daf99" },
  { name: "Salesforce", icon: "https://www.figma.com/api/mcp/asset/9ce60435-e1e0-4acb-bc04-da24815c7956" },
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
}: {
  state: BannerState;
  unsyncedCount: number;
  onDismiss: () => void;
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
          <RefreshCw className="w-6 h-6 text-[#3D3D3D] shrink-0" strokeWidth={1.5} />
          <p className="text-[14px] leading-5 text-[#3D3D3D]">
            {unsyncedCount} new file{unsyncedCount !== 1 ? "s are" : " is"} ready to update your CRM
          </p>
        </div>
        <Link
          href="/update-crm"
          className="bg-black text-white text-[14px] font-semibold leading-5 h-8 px-4 rounded-[5px] shrink-0 flex items-center"
        >
          Update
        </Link>
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

export default function SalesPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { openModal } = useFilterSort();
  const [bannerState, setBannerState] = useState<BannerState>("hidden");
  const [unsyncedCount, setUnsyncedCount] = useState(0);

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
        const [crm, calendar, recordings] = await Promise.all([
          api.getCrmStatus(),
          api.getCalendarStatus(),
          api.getUnsyncedRecordings(),
        ]);
        const connectedCount = [crm.connected, calendar.connected].filter(Boolean).length;
        if (connectedCount < 2) {
          setBannerState("connect");
        } else if (recordings.length > 0) {
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
        <div className="pb-6 border-b border-[#EBEBEB] mt-8">
          <button onClick={openModal} className="flex items-center gap-2">
            <h1 className="text-[44px] font-light leading-[52px]">For Sales</h1>
            <ChevronDown className="w-[18px] h-[18px] mt-1 text-black" strokeWidth={1.5} />
          </button>
        </div>

        {isEmpty ? (
          /* Empty state — vertically centered with feedback at bottom */
          <div className="flex flex-col flex-1 justify-between pb-6">
            <div />
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
            <div className="py-3 text-center">
              <p className="text-[13px] text-[#A3A3A3]">Send feedback</p>
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

            {/* Send feedback */}
            <div className="py-3 text-center mt-4">
              <p className="text-[13px] text-[#A3A3A3]">Send feedback</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
