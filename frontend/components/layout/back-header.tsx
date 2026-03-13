"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

interface BackHeaderProps {
  title: string;
  rightAction?: React.ReactNode;
  /** If set, back button navigates here instead of browser history back.
   *  Useful after OAuth redirects where history contains external pages. */
  fallbackHref?: string;
}

export function BackHeader({ title, rightAction, fallbackHref }: BackHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (fallbackHref) {
      router.replace(fallbackHref);
    } else {
      router.back();
    }
  };

  return (
    <div className="relative flex items-center h-11 px-6 shrink-0">
      <button onClick={handleBack} className="z-10">
        <ChevronLeft className="w-6 h-6" />
      </button>
      <span className="absolute inset-0 flex items-center justify-center text-[16px] font-semibold leading-6">
        {title}
      </span>
      {rightAction && <div className="ml-auto z-10">{rightAction}</div>}
    </div>
  );
}
