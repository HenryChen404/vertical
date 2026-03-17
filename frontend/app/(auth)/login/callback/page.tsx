"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * This page is no longer actively used — PLAUD OAuth callback now points
 * directly to the backend which sets the session cookie and redirects.
 * Kept as a fallback in case the user lands here.
 */
export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/files");
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-8 h-8 border-3 border-[#EBEBEB] border-t-black rounded-full animate-spin" />
      <p className="text-sm text-[#888888]">Redirecting...</p>
    </div>
  );
}
