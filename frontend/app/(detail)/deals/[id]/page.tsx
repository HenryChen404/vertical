"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { Deal } from "@/lib/types";
import { Users, Calendar, Mic } from "lucide-react";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);

  useEffect(() => {
    api.getDeal(id).then(setDeal).catch(console.error);
  }, [id]);

  if (!deal) return <div className="flex-1 flex items-center justify-center text-[#888]">Loading...</div>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader
        title={deal.name}
        rightAction={
          <Link href="/update-crm" className="text-[14px] font-medium text-[#1A89FF]">
            Update CRM
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Deal Info */}
        <div className="bg-white rounded-2xl p-5 space-y-2.5">
          <h3 className="text-[17px] font-semibold">{deal.name}</h3>
          <p className="text-[14px] text-[#888]">{deal.org_name} · {deal.sector}</p>
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-[13px] text-[#888]">Amount</p>
              <p className="text-[16px] font-semibold">{deal.amount}</p>
            </div>
            <div>
              <p className="text-[13px] text-[#888]">Stage</p>
              <p className="text-[16px] font-semibold">{deal.stage}</p>
            </div>
            <div>
              <p className="text-[13px] text-[#888]">Close Date</p>
              <p className="text-[16px] font-semibold">{deal.close_date}</p>
            </div>
          </div>
        </div>

        {/* Persons */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#888]" />
            <h4 className="text-[15px] font-semibold">Key Persons</h4>
          </div>
          {deal.persons.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[14px] font-medium">
                {p.name.charAt(0)}
              </div>
              <div>
                <p className="text-[15px] font-medium">{p.name}</p>
                <p className="text-[13px] text-[#888]">{p.title}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Meetings */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#888]" />
            <h4 className="text-[15px] font-semibold">Meetings</h4>
          </div>
          {deal.meetings.map((m) => (
            <Link key={m.id} href={`/schedule/${m.id}`} className="flex items-center justify-between py-1">
              <p className="text-[15px] font-medium">{m.title}</p>
              <p className="text-[13px] text-[#888]">{m.date}</p>
            </Link>
          ))}
        </div>

        {/* Recordings */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#888]" />
            <h4 className="text-[15px] font-semibold">Recordings</h4>
          </div>
          {deal.recordings.map((r) => (
            <div key={r.id} className="flex items-center justify-between py-1">
              <div>
                <p className="text-[15px] font-medium">{r.title}</p>
                <p className="text-[13px] text-[#888]">{r.date}</p>
              </div>
              <p className="text-[13px] text-[#888]">{r.duration}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
