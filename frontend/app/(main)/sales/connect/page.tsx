"use client";

import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NavBar } from "@/components/layout/nav-bar";
import { useFilterSort } from "@/components/layout/filter-sort-context";

export default function SalesConnectPage() {
  const { openModal } = useFilterSort();
  const router = useRouter();

  return (
    <div className="flex flex-col bg-[#F9F9F9] min-h-full">
      <NavBar />
      <div className="flex flex-col flex-1 px-6">
        {/* Title */}
        <button
          onClick={openModal}
          className="flex items-center gap-2 mt-8 pb-6 border-b border-[#EBEBEB] w-full text-left"
        >
          <h1 className="text-[44px] font-light leading-[52px]">For Sales</h1>
          <ChevronDown className="w-[18px] h-[18px] mt-1 text-black" strokeWidth={1.5} />
        </button>

        {/* Centered connect prompt */}
        <div className="flex flex-col items-center gap-3 pt-[88px] w-full">
          {/* Link icon */}
          <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" clipRule="evenodd" d="M48.5402 15.1954C49.0284 14.7073 49.8197 14.7073 50.3078 15.1954L62.8879 27.7765C63.3758 28.2647 63.376 29.056 62.8879 29.5441L40.134 52.298C39.646 52.7857 38.8545 52.7855 38.3664 52.298L25.7853 39.7159C25.2977 39.2278 25.2974 38.4364 25.7853 37.9484L31.5285 32.2062L31.5471 32.2247L31.5539 32.212L39.259 35.5763L42.8957 31.9406L32.467 21.5118L11.4807 42.4972L21.9094 52.9259L26.6965 48.1398L28.4641 49.9073L22.7932 55.5782C22.305 56.0661 21.5136 56.0663 21.0256 55.5782L8.82929 43.381C8.34118 42.8929 8.34123 42.1016 8.82929 41.6134L31.5832 18.8595C32.0712 18.3715 32.8626 18.3717 33.3508 18.8595L45.548 31.0568C46.0361 31.5448 46.0359 32.3362 45.548 32.8243L39.8049 38.5675L39.759 38.5216L32.0939 35.1749L28.4377 38.8322L39.2502 49.6456L60.2365 28.6603L49.424 17.8468L44.6369 22.6339L42.8693 20.8663L48.5402 15.1954Z" fill="#7A7A7A"/>
          </svg>

          {/* Text */}
          <div className="flex flex-col gap-1 items-center w-full">
            <p className="text-[20px] leading-7 text-black">
              Connect your tools
            </p>
            <p className="text-[14px] leading-5 text-[#7A7A7A] text-center">
              Link your calendar and CRM to track meetings, sync deals, and update records with AI-extracted insights.
            </p>
          </div>

          {/* Connect button */}
          <button
            onClick={() => router.push("/sales/connect/crm")}
            className="w-full bg-black text-white text-[16px] font-semibold leading-6 py-3 rounded-[5px] mt-5"
          >
            Connect
          </button>
        </div>
      </div>
    </div>
  );
}
