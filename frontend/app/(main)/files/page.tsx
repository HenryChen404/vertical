"use client";

import { useEffect, useState } from "react";
import { RotateCw, User, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { RecordingFile } from "@/lib/types";

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMeta(timestamp: string, seconds: number): string {
  const d = new Date(timestamp);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${min}  |  ${formatDuration(seconds)}`;
}

export default function FilesPage() {
  const [files, setFiles] = useState<RecordingFile[]>([]);

  useEffect(() => {
    api.getFiles().then(setFiles).catch(console.error);
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

      {/* Title */}
      <h1 className="text-[36px] font-normal mt-8 mb-2">Files</h1>

      {/* Page indicator */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-4 h-1 bg-black rounded-full" />
        <div className="w-4 h-1 bg-[#A3A3A3] rounded-full" />
      </div>

      {/* Divider */}
      <div className="h-px bg-[#EBEBEB] mb-4" />

      {/* File list */}
      <div className="space-y-0">
        {files.map((file) => (
          <div key={file.id}>
            <div className="py-4">
              <p className="text-[18px] font-medium leading-snug">{file.title}</p>
              <p className="text-[15px] text-[#888888] mt-1">
                {formatMeta(file.timestamp, file.duration_seconds)}
              </p>
            </div>
            <div className="h-px bg-[#EBEBEB]" />
          </div>
        ))}
      </div>
    </div>
  );
}
