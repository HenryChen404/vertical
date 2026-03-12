"use client";

import { Signal, Wifi, Battery } from "lucide-react";

interface StatusBarProps {
  dark?: boolean;
}

export function StatusBar({ dark }: StatusBarProps) {
  const color = dark ? "text-white" : "text-black";
  return (
    <div className={`flex items-center justify-between px-4 pt-[21px] pb-[19px] h-[62px] shrink-0 ${dark ? "bg-black" : ""}`}>
      <span className={`text-[17px] font-semibold ${color}`}>9:41</span>
      <div className={`flex items-center gap-[7px] ${color}`}>
        <Signal className="w-[18px] h-[18px]" />
        <Wifi className="w-[18px] h-[14px]" />
        <Battery className="w-[24px] h-[12px]" />
      </div>
    </div>
  );
}
