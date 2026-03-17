"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { NavBar } from "@/components/layout/nav-bar";
import { useFilterSort } from "@/components/layout/filter-sort-context";
import { api } from "@/lib/api";
import type { RecordingFile } from "@/lib/types";

function formatMeta(timestamp: string, seconds: number): string {
  const d = new Date(timestamp);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const timeStr = `${hh}:${mm}`;

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const dur = h > 0 ? `${h}h ${m}m` : `${m}m`;

  if (d.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeStr}　｜　${dur}`;
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getDate()} at ${timeStr}　｜　${dur}`;
}

export default function FilesPage() {
  const [files, setFiles] = useState<RecordingFile[]>([]);
  const { openModal } = useFilterSort();

  useEffect(() => {
    api.getFiles().then(setFiles).catch(console.error);
  }, []);

  return (
    <div className="bg-[#F9F9F9] min-h-full">
      <NavBar />
      <div className="px-6">
        {/* Title */}
        <button
          onClick={openModal}
          className="flex items-center gap-2 mt-8 pb-6 border-b border-[#EBEBEB] w-full text-left"
        >
          <h1 className="text-[44px] font-light leading-[52px] tracking-normal">All files</h1>
          <ChevronDown className="w-[18px] h-[18px] mt-1 text-black" strokeWidth={1.5} />
        </button>

        {/* File list */}
        <div className="py-4 flex flex-col gap-5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex flex-col gap-1 pb-5 border-b border-[#EBEBEB]"
            >
              <p className="text-[16px] text-[#3D3D3D] leading-6">{file.title}</p>
              <p className="text-[13px] text-[#7A7A7A] leading-4">
                {formatMeta(file.timestamp || file.recorded_at || "", file.duration_seconds)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
