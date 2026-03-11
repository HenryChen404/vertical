"use client";

import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { Bot, Mic, Send, CheckCircle } from "lucide-react";

export default function UpdateCrmSuccessPage() {
  const router = useRouter();

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <BackHeader title="Update CRM" />

      {/* Chat area */}
      <div className="flex-1 px-4 py-4 bg-[#F9F9F9]">
        <div className="flex items-start gap-2">
          <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div className="space-y-3 flex-1">
            <div className="bg-white rounded-2xl rounded-tl-sm p-4 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-[#22C55E]" />
                <span className="text-[15px] font-semibold">CRM Updated Successfully</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#888]">Fields Updated</span>
                  <span className="text-[13px] font-medium">5</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#888]">Opportunity</span>
                  <span className="text-[13px] font-medium text-[#22C55E]">3 changes</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[#888]">Contact</span>
                  <span className="text-[13px] font-medium text-[#22C55E]">2 changes</span>
                </div>
              </div>
              <button
                onClick={() => router.push("/sales")}
                className="w-full h-10 bg-black text-white rounded-xl text-[13px] font-medium"
              >
                Back to Sales
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Input area */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-8 bg-white shrink-0">
        <div className="flex-1 h-11 bg-[#F9F9F9] rounded-full px-4 flex items-center">
          <span className="text-[14px] text-[#A3A3A3]">Type a message...</span>
        </div>
        <button className="w-11 h-11 rounded-full bg-[#F9F9F9] flex items-center justify-center">
          <Mic className="w-5 h-5 text-[#888]" />
        </button>
        <button className="w-11 h-11 rounded-full bg-[#1A89FF] flex items-center justify-center">
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
}
