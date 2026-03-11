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
    <div className="flex items-center justify-between h-11 px-4 shrink-0">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}>
          <ChevronLeft className="w-6 h-6" />
        </button>
        <span className="text-[17px] font-semibold">{title}</span>
      </div>
      {rightAction}
    </div>
  );
}
