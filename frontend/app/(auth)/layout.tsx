"use client";

import { PhoneFrame } from "@/components/layout/phone-frame";
import { StatusBar } from "@/components/layout/status-bar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame>
      <StatusBar />
      <div className="flex-1 overflow-y-auto">{children}</div>
    </PhoneFrame>
  );
}
