"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { BackHeader } from "@/components/layout/back-header";
import { api } from "@/lib/api";
import type { MeetingDetail } from "@/lib/types";
import { ChevronRight } from "lucide-react";

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);

  useEffect(() => {
    api.getMeeting(id).then(setMeeting).catch(console.error);
  }, [id]);

  if (!meeting)
    return (
      <div className="flex-1 flex items-center justify-center text-[#888]">
        Loading...
      </div>
    );

  const hasSalesDetails = meeting.account?.name || meeting.opportunity?.name;
  const sources = "Salesforce"; // TODO: derive from event_sources

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F9F9]">
      <BackHeader title={`Meeting from ${sources}`} fallbackHref="/sales" />
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-10 pt-4">
          {/* Meeting Details */}
          <div className="flex flex-col gap-4">
            {/* Title */}
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3">
                <h1 className="text-[28px] font-light leading-8 text-black">
                  {meeting.opportunity?.name || meeting.title}
                </h1>
              </div>
            </div>

            {/* Details rows */}
            <div className="flex flex-col gap-4 px-6">
              {/* Date & Time */}
              <div className="flex items-center gap-2">
                <Image src="/icons/calendar.svg" alt="" width={24} height={24} className="shrink-0" />
                <p className="text-[16px] text-[#3D3D3D] leading-6">
                  {meeting.date} ｜ {meeting.time_start} - {meeting.time_end}
                </p>
              </div>

              {/* Location */}
              {meeting.location && (
                <div className="flex items-center gap-2">
                  <Image src="/icons/location.svg" alt="" width={24} height={24} className="shrink-0" />
                  <p className="text-[16px] text-[#3D3D3D] leading-6">
                    {meeting.location}
                  </p>
                </div>
              )}

              {/* Participants */}
              {meeting.attendees.length > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Image src="/icons/participants.svg" alt="" width={24} height={24} className="shrink-0" />
                    <p className="text-[16px] text-[#3D3D3D] leading-6">
                      {meeting.attendees.length} participant
                      {meeting.attendees.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <button className="flex items-center gap-1">
                    <span className="text-[13px] text-[#A3A3A3]">Show all</span>
                    <ChevronRight className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.5} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Sales Details */}
          {hasSalesDetails && (
            <div className="flex flex-col gap-5">
              <div className="px-6">
                <div className="border-b border-[#EBEBEB] pb-3">
                  <h2 className="text-[20px] font-light leading-7 text-black">
                    Sales Details
                  </h2>
                </div>
              </div>

              <div className="flex flex-col gap-4 px-6">
                {/* Account */}
                {meeting.account?.name && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Image src="/icons/account.svg" alt="" width={24} height={24} className="shrink-0" />
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {meeting.account.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 pl-8">
                      {meeting.account.annual_revenue && (
                        <p className="text-[16px] text-[#3D3D3D] leading-6">
                          {meeting.account.annual_revenue} ARR
                        </p>
                      )}
                      {meeting.account.sector && (
                        <p className="text-[13px] text-[#A3A3A3] leading-4">
                          {meeting.account.sector}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Opportunity */}
                {meeting.opportunity?.name && (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <Image src="/icons/opportunity.svg" alt="" width={24} height={24} className="shrink-0" />
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {meeting.opportunity.name}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 pl-8">
                      {meeting.opportunity.amount && (
                        <p className="text-[16px] text-[#3D3D3D] leading-6">
                          {meeting.opportunity.amount}
                        </p>
                      )}
                      <p className="text-[13px] text-[#A3A3A3] leading-4">
                        {[meeting.opportunity.stage, meeting.opportunity.close_date]
                          .filter(Boolean)
                          .join(" ｜ ")}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Feedback */}
          <div className="flex flex-col gap-5">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Feedback
                </h2>
                <div className="flex items-center gap-3">
                  <Image src="/icons/pen.svg" alt="" width={24} height={24} />
                  <Image src="/icons/mic.svg" alt="" width={24} height={24} />
                </div>
              </div>
            </div>
            <div className="px-6">
              <p className="text-[16px] text-[#A3A3A3] leading-6">
                {meeting.feedback || "No feedback yet"}
              </p>
            </div>
          </div>

          {/* Related Files */}
          <div className="flex flex-col gap-5 pb-8">
            <div className="px-6">
              <div className="border-b border-[#EBEBEB] pb-3 flex items-center justify-between">
                <h2 className="text-[20px] font-light leading-7 text-black">
                  Related Files
                </h2>
                <Image src="/icons/plus.svg" alt="" width={24} height={24} />
              </div>
            </div>
            <div className="flex flex-col gap-6 px-6">
              {meeting.linked_files.length > 0 ? (
                meeting.linked_files.map((f) => (
                  <div key={f.id} className="flex items-start justify-between">
                    <div className="flex-1 flex flex-col gap-1">
                      <p className="text-[16px] text-[#3D3D3D] leading-6">
                        {f.title}
                      </p>
                      <p className="text-[13px] text-[#7A7A7A] leading-4">
                        {f.duration}
                      </p>
                    </div>
                    <Image src="/icons/minus.svg" alt="" width={24} height={24} className="shrink-0" />
                  </div>
                ))
              ) : (
                <p className="text-[16px] text-[#A3A3A3] leading-6">
                  No related files
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
