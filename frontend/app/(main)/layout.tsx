"use client";

import { usePathname } from "next/navigation";
import { PhoneFrame } from "@/components/layout/phone-frame";
import { StatusBar } from "@/components/layout/status-bar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";
import { FilterSortProvider } from "@/components/layout/filter-sort-context";
import { FilterSortSheet } from "@/components/layout/filter-sort-sheet";
import { IntroBanner } from "@/components/layout/intro-banner";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const darkStatusBar = pathname === "/explore";

  return (
    <FilterSortProvider>
      <PhoneFrame>
        <StatusBar dark={darkStatusBar} />
        <div className="flex-1 overflow-y-auto">{children}</div>
        <BottomTabBar />
        {/* Rendered here so it can cover the BottomTabBar */}
        <FilterSortSheet />
        <IntroBanner />
      </PhoneFrame>
    </FilterSortProvider>
  );
}
