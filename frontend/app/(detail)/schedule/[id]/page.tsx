"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { MeetingDetail } from "@/lib/types";
import { Calendar, MapPin, Users, Mic, FileText } from "lucide-react";

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);

  useEffect(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error);
  }, [id]);

  if (!meeting) return <div className="flex-1 flex items-center justify-center text-[#888]">Loading...</div>;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title={meeting.title} />
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Time & Location */}
        <div className="bg-white rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[#888]" />
            <div>
              <p className="text-[15px] font-medium">{meeting.date}</p>
              <p className="text-[13px] text-[#888]">{meeting.time_start} - {meeting.time_end}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="w-5 h-5 text-[#888]" />
            <p className="text-[15px]">{meeting.location}</p>
          </div>
        </div>

        {/* CRM Cards */}
        <div className="flex gap-3">
          <div className="flex-1 bg-white rounded-2xl p-4 space-y-1">
            <p className="text-[11px] text-[#888] uppercase tracking-wide">Account</p>
            <p className="text-[15px] font-semibold">{meeting.account.name}</p>
            <p className="text-[13px] text-[#888]">{meeting.account.sector}</p>
          </div>
          <div className="flex-1 bg-white rounded-2xl p-4 space-y-1">
            <p className="text-[11px] text-[#888] uppercase tracking-wide">Opportunity</p>
            <p className="text-[15px] font-semibold">{meeting.opportunity.name}</p>
            <p className="text-[13px] text-[#888]">{meeting.opportunity.amount} · {meeting.opportunity.stage}</p>
          </div>
        </div>

        {/* Attendees */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#888]" />
            <h4 className="text-[15px] font-semibold">Attendees</h4>
          </div>
          {meeting.attendees.map((a) => (
            <div key={a.id} className="flex items-center gap-3 py-1">
              <div className="w-9 h-9 rounded-full bg-[#F0F0F0] flex items-center justify-center text-[14px] font-medium">
                {a.name.charAt(0)}
              </div>
              <div>
                <p className="text-[15px] font-medium">{a.name}</p>
                <p className="text-[13px] text-[#888]">{a.title}, {a.company}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Feedback / Start Recording */}
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-[#888]" />
            <h4 className="text-[15px] font-semibold">Recording</h4>
          </div>
          <p className="text-[14px] text-[#888]">{meeting.feedback || "No recording yet"}</p>
          <Link
            href={`/schedule/${meeting.id}/recording`}
            className="block w-full text-center bg-[#FB2C36] text-white rounded-xl py-3 text-[15px] font-medium"
          >
            Start Recording
          </Link>
        </div>

        {/* Linked Files */}
        {meeting.linked_files.length > 0 && (
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#888]" />
              <h4 className="text-[15px] font-semibold">Linked Files</h4>
            </div>
            {meeting.linked_files.map((f) => (
              <div key={f.id} className="flex items-center justify-between py-1">
                <p className="text-[15px]">{f.title}</p>
                <p className="text-[13px] text-[#888]">{f.duration}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
