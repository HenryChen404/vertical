"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BackHeader } from "@/components/layout/back-header";
import { Bot, Mic, Send } from "lucide-react";

export default function UpdateCrmProcessingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [currentItem, setCurrentItem] = useState("Opportunity: Stage");

  const items = [
    "Opportunity: Stage",
    "Opportunity: Amount",
    "Opportunity: Close Date",
    "Account: Industry",
    "Contact: Title",
  ];

  useEffect(() => {
    let step = 0;
    const timer = setInterval(() => {
      step++;
      if (step >= items.length) {
        setProgress(100);
        setCurrentItem("Complete");
        clearInterval(timer);
        setTimeout(() => router.push("/update-crm/success"), 800);
      } else {
        setProgress(Math.round((step / items.length) * 100));
        setCurrentItem(items[step]);
      }
    }, 700);
    return () => clearInterval(timer);
  }, [router]);

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
            <p className="text-[14px] bg-white rounded-2xl rounded-tl-sm px-4 py-3">
              Updating your CRM...
            </p>
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium">Progress</span>
                <span className="text-[13px] text-[#888]">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1A89FF] rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[12px] text-[#888]">Updating: {currentItem}</p>
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
