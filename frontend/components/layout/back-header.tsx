"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
}

export function BackHeader({ title, rightAction }: BackHeaderProps) {
  const router = useRouter();

  return (
    <div className="relative flex items-center h-11 px-6 shrink-0">
      <button onClick={() => router.back()} className="z-10">
        <ChevronLeft className="w-6 h-6" />
      </button>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] font-semibold leading-6">
        {title}
      </span>
      {rightAction && <div className="ml-auto z-10">{rightAction}</div>}
    </div>
  );
}
