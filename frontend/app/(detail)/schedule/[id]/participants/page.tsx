"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { MeetingDetail, Attendee } from "@/lib/types";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function AttendeeRow({ attendee }: { attendee: Attendee }) {
  const initials = getInitials(attendee.name);
  const subtitle = [attendee.title, attendee.company]
    .filter(Boolean)
    .join(" ｜ ");

  return (
    <div className="flex items-center gap-3 px-6 py-2">
      {/* Avatar */}
      {attendee.avatar_url ? (
        <img
          src={attendee.avatar_url}
          alt=""
          className="w-10 h-10 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-[#F0F0F0] flex items-center justify-center shrink-0">
          <span className="text-[14px] text-[#7A7A7A] font-medium">
            {initials}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-[16px] text-black leading-6 truncate">
          {attendee.name}
        </p>
        {subtitle && (
          <p className="text-[13px] text-[#A3A3A3] leading-4 truncate">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

export default function ParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);

  useEffect(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error);
  }, [id]);

  if (!meeting) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#888]">
        Loading...
      </div>
    );
  }

  const count = meeting.attendees.length;

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F9F9]">
      <BackHeader
        title={`${count} Participant${count !== 1 ? "s" : ""}`}
        fallbackHref={`/schedule/${id}`}
      />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-1 pt-4">
          {meeting.attendees.map((a) => (
            <AttendeeRow key={a.id} attendee={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
