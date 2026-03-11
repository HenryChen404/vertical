"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCw, User, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { ScheduleMeeting } from "@/lib/types";
import { ScheduleCard } from "@/components/sales/schedule-card";

export default function SalesPage() {
  const [schedule, setSchedule] = useState<{ today: ScheduleMeeting[]; tomorrow: ScheduleMeeting[] }>({ today: [], tomorrow: [] });

  useEffect(() => {
    api.getSchedule().then(setSchedule).catch(console.error);
  }, []);

  return (
    <div className="px-6">
      {/* Device indicator + actions */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-1">
          <div className="w-[18px] h-6 rounded-[3px] border-[1.5px] border-black bg-white relative">
            <div className="absolute left-[-7px] top-1 w-1 h-5 bg-[#22C55E] rounded-sm" />
            <div className="absolute w-[3px] h-[3px] rounded-full bg-black top-[-1px] right-[-4px]" />
            <div className="w-full h-[1.5px] bg-black mt-[6px]" />
          </div>
          <ChevronDown className="w-4 h-4" />
        </div>
        <div className="flex items-center gap-2">
          <RotateCw className="w-[22px] h-[22px]" />
          <User className="w-[22px] h-[22px]" />
        </div>
      </div>

      {/* Title row */}
      <div className="flex items-center justify-between mt-8 mb-2">
        <h1 className="text-[36px] font-normal">For Sales</h1>
        <Link href="/update-crm" className="text-[16px] font-medium text-[#1A89FF]">
          Update CRM
        </Link>
      </div>

      {/* Page indicator */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-1 bg-[#A3A3A3] rounded-full" />
        <div className="w-4 h-1 bg-black rounded-full" />
      </div>

      {/* Divider */}
      <div className="h-px bg-[#EBEBEB] mb-4" />

      {/* Today */}
      {schedule.today.length > 0 && (
        <>
          <p className="text-[14px] font-semibold text-[#888888] mb-3">Today</p>
          <div className="space-y-3">
            {schedule.today.map((meeting) => (
              <ScheduleCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </>
      )}

      {/* Tomorrow */}
      {schedule.tomorrow.length > 0 && (
        <>
          <p className="text-[14px] font-semibold text-[#888888] mt-6 mb-3">Tomorrow</p>
          <div className="space-y-3">
            {schedule.tomorrow.map((meeting) => (
              <ScheduleCard key={meeting.id} meeting={meeting} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
