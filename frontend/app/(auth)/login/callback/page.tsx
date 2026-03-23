"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const authCode = searchParams.get("auth_code");

    if (!authCode) {
      // No auth code — either old flow or direct visit, just go to /files
      router.replace("/files");
      return;
    }

    // Exchange the one-time code for a session cookie
    async function exchangeCode() {
      try {
        const res = await fetch(`${API_BASE}/api/auth/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ code: authCode }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Exchange failed");
        }

        // Cookie is now set on the backend domain — redirect to /files
        router.replace("/files?syncing=1");
      } catch (e: any) {
        console.error("Auth code exchange failed:", e);
        setError(e.message || "Authentication failed");
        setTimeout(() => router.replace("/login"), 2000);
      }
    }

    exchangeCode();
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
