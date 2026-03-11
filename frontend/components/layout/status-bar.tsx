"use client";

import { Signal, Wifi, Battery } from "lucide-react";

export function StatusBar() {
  return (
    <div className="flex items-center justify-between px-4 pt-[21px] pb-[19px] h-[62px]">
      <span className="text-[17px] font-semibold">9:41</span>
      <div className="flex items-center gap-[7px]">
        <Signal className="w-[18px] h-[18px]" />
        <Wifi className="w-[18px] h-[14px]" />
        <Battery className="w-[24px] h-[12px]" />
      </div>
    </div>
  );
}
