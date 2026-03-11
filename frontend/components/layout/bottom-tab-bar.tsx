"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Folder, Plus, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <div className="bg-white pt-2 pb-8 flex items-center justify-around shrink-0">
      <Link href="/files" className="flex flex-col items-center gap-1">
        <Folder
          className={cn("w-7 h-7", pathname.startsWith("/files") ? "text-black" : "text-gray-400")}
        />
      </Link>
      <button className="w-[54px] h-[54px] bg-black rounded-full flex items-center justify-center -mt-6">
        <Plus className="w-6 h-6 text-white" />
      </button>
      <Link href="/sales" className="flex flex-col items-center gap-1">
        <LayoutGrid
          className={cn("w-7 h-7", pathname.startsWith("/sales") ? "text-black" : "text-gray-400")}
        />
      </Link>
    </div>
  );
}
