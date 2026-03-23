"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      // No token — either old flow or direct visit
      router.replace("/files");
      return;
    }

    // Set session cookie on the frontend domain via Next.js API route
    async function setSession() {
      try {
        const res = await fetch("/api/auth/set-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) throw new Error("Failed to set session");

        router.replace("/files?syncing=1");
      } catch (e: any) {
        console.error("Set session failed:", e);
        setError(e.message || "Authentication failed");
        setTimeout(() => router.replace("/login"), 2000);
      }
    }

    setSession();
  }, [searchParams, router]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-8 h-8 border-3 border-[#EBEBEB] border-t-black rounded-full animate-spin" />
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <p className="text-sm text-[#888888]">Signing in...</p>
      )}
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <div className="w-8 h-8 border-3 border-[#EBEBEB] border-t-black rounded-full animate-spin" />
          <p className="text-sm text-[#888888]">Signing in...</p>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
