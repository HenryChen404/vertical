"use client";

import { useState } from "react";
import Image from "next/image";
import { api } from "@/lib/api";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    try {
      const { url } = await api.auth.login();
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex flex-col h-full bg-[#F9F9F9]">
      {/* Brand section */}
      <div className="flex flex-col items-center gap-4 pt-[118px]">
        {/* PLAUD Logo */}
        <div className="flex items-center justify-center w-20 h-20">
          <Image src="/plaud-icon.svg" alt="PLAUD" width={64} height={64} />
        </div>
        <span className="text-[32px] font-bold tracking-[4px] text-black">Plaud For Sales</span>
        <span className="text-[15px] text-[#888888]">AI-Powered Sales Intelligence</span>
      </div>

      {/* Auth button */}
      <div className="px-6 mt-[82px]">
        <button
          onClick={handleLogin}
          disabled={loading}
          className="flex items-center justify-center gap-2.5 w-full h-[52px] rounded-xl bg-black text-white disabled:opacity-60"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <Image src="/plaud-icon.svg" alt="" width={20} height={20} className="invert" />
              <span className="text-base font-semibold">Continue with PLAUD</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="absolute bottom-[69px] left-6 right-6 flex flex-col items-center gap-2">
        <span className="text-xs text-[#888888] text-center">
          By continuing, you agree to PLAUD&apos;s
        </span>
        <div className="flex items-center justify-center gap-1">
          <span className="text-xs font-medium text-black">Terms of Service</span>
          <span className="text-xs text-[#888888]">and</span>
          <span className="text-xs font-medium text-black">Privacy Policy</span>
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-[8px] left-1/2 -translate-x-1/2 w-[144px] h-[5px] bg-black rounded-[2.5px]" />
    </div>
  );
}
