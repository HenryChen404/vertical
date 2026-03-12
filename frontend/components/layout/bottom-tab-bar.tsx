"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function BottomTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const filesActive = pathname.startsWith("/files") || pathname.startsWith("/sales");
  const exploreActive = pathname.startsWith("/explore");

  return (
    <div className="bg-white shrink-0 relative" style={{ height: 92 }}>
      {/* Tab buttons */}
      <div className="absolute left-0 right-0 flex items-end justify-around pb-1" style={{ top: -14 }}>
        {/* Files tab */}
        <Link href="/files" className="flex flex-col items-center justify-end h-[54px] flex-1 pt-2">
          <img
            src={filesActive ? "/icons/files-active.svg" : "/icons/files-inactive.svg"}
            alt="Files"
            width={30}
            height={30}
          />
        </Link>

        {/* Add button */}
        <div className="flex flex-1 items-start justify-center h-[68px] pt-1">
          <button
            onClick={() => router.push("/update-crm")}
            className={cn(
              "w-[54px] h-[54px] bg-black rounded-full flex items-center justify-center",
              "shadow-[0px_10px_10px_0px_rgba(0,0,0,0.1)]"
            )}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Explore tab */}
        <Link href="/explore" className="flex flex-col items-center justify-end h-[54px] flex-1 pt-2">
          <img
            src={exploreActive ? "/icons/explore-active.svg" : "/icons/explore-inactive.svg"}
            alt="Explore"
            width={30}
            height={30}
          />
        </Link>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center">
        <div className="w-[144px] h-[5px] bg-black rounded-full" />
      </div>
    </div>
  );
}
