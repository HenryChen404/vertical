"use client";

import Link from "next/link";
import { ChevronDown, User } from "lucide-react";

function SearchAiIcon() {
  return (
    <div className="relative w-6 h-6">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20.5 20.5L16.2 16.2M18 11C18 14.866 14.866 18 11 18C7.134 18 4 14.866 4 11C4 7.134 7.134 4 11 4C14.866 4 18 7.134 18 11Z"
          stroke="black"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute -top-0.5 -right-0.5">
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M4.5 0.5L5.4 3.3L8.3 4.5L5.4 5.7L4.5 8.5L3.6 5.7L0.7 4.5L3.6 3.3L4.5 0.5Z" fill="black" />
        </svg>
      </div>
    </div>
  );
}

function PlaudDeviceIcon() {
  return (
    <div className="relative w-[18px] h-[22px]">
      <div className="w-full h-full rounded-[3px] border border-black bg-white" />
      <div className="absolute left-[-4px] top-[3px] w-[3px] h-[16px] bg-[#22C55E] rounded-sm" />
    </div>
  );
}

export function NavBar() {
  return (
    <div className="flex items-center justify-between px-6 h-11">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-[6px]">
        <PlaudDeviceIcon />
        <ChevronDown className="w-[14px] h-[14px]" strokeWidth={2} />
      </div>
      <div className="flex items-center gap-4">
        <SearchAiIcon />
        <Link href="/sales/onboarding/crm">
          <User className="w-6 h-6" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
