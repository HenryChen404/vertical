"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { Deal, DealContact } from "@/lib/types";

function formatCloseDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD" — parse parts to avoid timezone shift
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "";
  return `$${amount.toLocaleString()}`;
}

function formatArrCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M ARR`;
  if (amount >= 1_000) return `$${Math.round(amount / 1_000)}K ARR`;
  return `$${amount.toLocaleString()} ARR`;
}

function formatMeetingTimeRange(startStr: string, endStr?: string): string {
  const start = new Date(startStr);
  const now = new Date();
  const isToday = start.toDateString() === now.toDateString();
  const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  let range = startTime;
  if (endStr) {
    const endTime = new Date(endStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    range = `${startTime} - ${endTime}`;
  }

  if (isToday) return `Today, ${range}`;
  const dateStr = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return `${dateStr}, ${range}`;
}

function formatRecordedMeta(recordedAt?: string, durationSeconds?: number): string {
  const parts: string[] = [];
  if (recordedAt) {
    const d = new Date(recordedAt);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const recordDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

    if (recordDate.getTime() === today.getTime()) parts.push(`Today at ${time}`);
    else if (recordDate.getTime() === yesterday.getTime()) parts.push(`Yesterday at ${time}`);
    else parts.push(`${d.toLocaleDateString([], { month: "short", day: "numeric" })} at ${time}`);
  }
  if (durationSeconds) {
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    if (h > 0) parts.push(m > 0 ? `${h}h ${m}m` : `${h}h`);
    else if (m > 0) parts.push(`${m}m`);
  }
  return parts.join(" ｜ ");
}

function getInitials(name: string): string {
  const p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function ContactRow({ contact }: { contact: DealContact }) {
  const subtitle = [contact.title, contact.company].filter(Boolean).join(" ｜ ");
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-[#F0F0F0] flex items-center justify-center shrink-0">
        <span className="text-[14px] text-[#7A7A7A] font-medium">
          {getInitials(contact.name)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[16px] text-black leading-6 truncate">{contact.name}</p>
        {subtitle && (
          <p className="text-[13px] text-[#A3A3A3] leading-4 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);

  useEffect(() => {
    api.getDeal(id).then(setDeal).catch(console.error);
  }, [id]);

  if (!deal) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#888]">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F9F9]">
      <BackHeader title="Deal from Salesforce" fallbackHref="/sales" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-10 pt-4">
          {/* Deal Info */}
          <div className="flex flex-col gap-4">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3">
                <h1 className="text-[28px] font-light leading-8 text-black">
                  {deal.name}
                </h1>
              </div>
            </div>

            <div className="flex flex-col gap-4 px-6">
              {deal.stage && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/stage.svg" alt="" width={24} height={24} className="shrink-0" />
                  <p className="text-[16px] text-[#3D3D3D] leading-6">{deal.stage}</p>
                </div>
              )}
              {deal.amount !== null && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/amount.svg" alt="" width={24} height={24} className="shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <p className="text-[16px] text-[#3D3D3D] leading-6">{formatCurrency(deal.amount)}</p>
                </div>
              )}
              {deal.close_date && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/closing.svg" alt="" width={24} height={24} className="shrink-0" />
                  <p className="text-[16px] text-[#3D3D3D] leading-6">
                    Closing {formatCloseDate(deal.close_date)}
                  </p>
                </div>
              )}
              {deal.account?.name && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/account.svg" alt="" width={24} height={24} className="shrink-0" />
                    <p className="text-[16px] text-[#3D3D3D] leading-6">{deal.account.name}</p>
                  </div>
                  {(deal.account.revenue || deal.account.industry) && (
                    <div className="flex items-center gap-2 pl-8">
                      <p className="text-[13px] text-[#A3A3A3] leading-4">
                        {[formatArrCurrency(deal.account.revenue ?? null), deal.account.industry].filter(Boolean).join(" ｜ ")}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contacts */}
          {deal.contacts.length > 0 && (
            <div className="flex flex-col gap-5">
              <div className="px-6">
                <div className="border-b border-[#EBEBEB] pb-3">
                  <h2 className="text-[20px] font-light leading-7 text-black">Contacts</h2>
                </div>
              </div>
              <div className="flex flex-col gap-4 px-6">
                {deal.contacts.map((c) => (
                  <ContactRow key={c.id} contact={c} />
                ))}
              </div>
            </div>
          )}

          {/* Related Meetings */}
          {deal.meetings.length > 0 && (
            <div className="flex flex-col gap-5">
              <div className="px-6">
                <div className="border-b border-[#EBEBEB] pb-3">
                  <h2 className="text-[20px] font-light leading-7 text-black">Related Meetings</h2>
                </div>
              </div>
              <div className="flex flex-col gap-6 px-6">
                {deal.meetings.map((m) => (
                  <Link key={m.id} href={`/schedule/${m.id}`} className="flex flex-col gap-1">
                    <p className="text-[13px] text-[#7A7A7A] leading-4">
                      {formatMeetingTimeRange(m.start_time, m.end_time)}
                    </p>
                    <p className="text-[16px] text-[#3D3D3D] leading-6">{m.title}</p>
                    {m.subtitle && (
                      <p className="text-[13px] text-[#7A7A7A] leading-4">{m.subtitle}</p>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Related Recordings */}
          <div className="flex flex-col gap-5 pb-8">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Related Recordings
                </h2>
                <Image src="/icons/plus.svg" alt="" width={24} height={24} />
              </div>
            </div>
            <div className="flex flex-col gap-6 px-6">
              {deal.recordings.length > 0 ? (
                deal.recordings.map((r) => (
                  <div key={r.id} className="flex items-start justify-between">
                    <div className="flex-1 flex flex-col gap-1">
                      <p className="text-[16px] text-[#3D3D3D] leading-6">{r.title}</p>
                      <p className="text-[13px] text-[#7A7A7A] leading-4">
                        {formatRecordedMeta(r.recorded_at, r.duration_seconds)}
                      </p>
                    </div>
                    <Image src="/icons/minus.svg" alt="" width={24} height={24} className="shrink-0" />
                  </div>
                ))
              ) : (
                <p className="text-[16px] text-[#A3A3A3] leading-6">No related recordings</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
