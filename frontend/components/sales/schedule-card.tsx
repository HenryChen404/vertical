"use client";

import Link from "next/link";
import type { ScheduleMeeting } from "@/lib/types";

export function ScheduleCard({ meeting }: { meeting: ScheduleMeeting }) {
  return (
    <Link href={`/schedule/${meeting.id}`}>
      <div className="bg-white rounded-xl p-4 space-y-2">
        <p className="text-[13px] text-[#888888]">
          {meeting.time_start} - {meeting.time_end}
        </p>
        <p className="text-[16px] font-medium">{meeting.title}</p>
        {meeting.crm_tags.length > 0 && (
          <div className="space-y-1">
            {meeting.crm_tags.map((tag, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
                <span className="text-[13px] text-[#888888]">{tag.label}</span>
              </div>
            ))}
          </div>
        )}
        {meeting.feedback_label && (
          <div className="flex justify-end">
            <span className="text-[16px] font-medium text-[#1A89FF]">{meeting.feedback_label}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
