"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Check } from "lucide-react";

const IMG_GOOGLE_CALENDAR = "https://www.figma.com/api/mcp/asset/486928f8-9916-4c98-bc7f-0cac88978ece";
const IMG_OUTLOOK = "https://www.figma.com/api/mcp/asset/9a342f86-faa3-43a2-a621-bb3cfa5c69e3";
const IMG_SALESFORCE = "https://www.figma.com/api/mcp/asset/7185efb8-beaf-41b4-be5b-82f33a21848b";
const IMG_LINK_ICON = "https://www.figma.com/api/mcp/asset/622700cd-b7c0-46e5-af79-2456ca571a4b";
const IMG_SMALL_CALENDAR = "https://www.figma.com/api/mcp/asset/2473c1e4-1a2d-47d9-86a5-d6043fce2c5d";

const FEATURES = [
  "See upcoming meetings from your calendar",
  "Sync deals and activities instantly",
  "Update CRM records with AI-generated insights",
];

const STORAGE_KEY = "intro-banner-dismissed";

export function IntroBanner() {
  const [visible, setVisible] = useState(false);
  const router = useRouter();

  // Only show if user hasn't dismissed before
  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setVisible(true);
      }
    } catch {
      // SSR or localStorage unavailable
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  };

  const handleLearnMore = () => {
    dismiss();
    router.push("/sales/connect");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={dismiss}
      />

      {/* Panel */}
      <div
        className={`absolute inset-x-0 bottom-0 z-50 bg-white rounded-t-[16px] transition-transform duration-300 ease-out ${
          visible ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "94%" }}
      >
        {/* Cover illustration */}
        <div
          className="relative w-full h-[199px] overflow-hidden rounded-t-[16px]"
          style={{
            background:
              "radial-gradient(ellipse at center bottom, rgba(201,255,202,1) 0%, rgba(183,243,250,1) 20%, rgba(208,234,246,1) 40%, rgba(239,245,255,1) 60%, rgba(242,239,235,1) 100%)",
            opacity: 0.5,
          }}
        >
          {/* Decorative card placeholders */}
          <div className="absolute right-[30px] top-[16px] w-[101px] bg-white/60 rounded-[1.5px] p-[5px] opacity-60">
            <div className="flex flex-col gap-[3px]">
              <div className="h-[3.5px] w-[33px] bg-[#EBEBEB] rounded-[1px]" />
              <div className="h-[4.5px] w-[71px] bg-[#EBEBEB] rounded-[1px]" />
              <div className="h-[3.5px] w-[55px] bg-[#EBEBEB] rounded-[1px]" />
            </div>
          </div>

          <div className="absolute left-[42px] bottom-[16px] w-[122px] bg-white/30 rounded-[2px] p-[6px] opacity-30">
            <div className="flex flex-col gap-[3px]">
              <div className="h-[4px] w-[40px] bg-[#EBEBEB] rounded-[1px]" />
              <div className="h-[5px] w-[86px] bg-[#EBEBEB] rounded-[1px]" />
              <div className="h-[4px] w-[67px] bg-[#EBEBEB] rounded-[1px]" />
            </div>
          </div>

          {/* Meeting card placeholder */}
          <div className="absolute left-[91px] top-[21px] w-[99px] bg-white/60 rounded-[1.5px] p-[5px] opacity-60">
            <div className="flex flex-col gap-[1px]">
              <p className="text-[3.8px] text-[#7A7A7A] leading-[5px]">10:00 - 11:00</p>
              <p className="text-[4.7px] text-[#3D3D3D] leading-[7px]">Partnership Alignment Meeting</p>
              <p className="text-[3.8px] text-[#7A7A7A] leading-[5px]">Acme Corporation | Q1 Enterprise Deal</p>
            </div>
          </div>

          {/* Google Calendar icon */}
          <div className="absolute left-[86px] top-[38px] w-[73px] h-[73px] -rotate-[15deg]">
            <div className="w-full h-full backdrop-blur-[2px] bg-white/50 border border-[#EBEBEB] rounded-[8px] overflow-hidden flex items-center justify-center">
              <img src={IMG_GOOGLE_CALENDAR} alt="Google Calendar" className="w-[41px] h-[41px] object-contain" />
            </div>
          </div>

          {/* Outlook icon */}
          <div className="absolute right-[100px] top-[45px] w-[72px] h-[72px] rotate-[15deg]">
            <div className="w-full h-full backdrop-blur-[2px] bg-white/50 border border-[#EBEBEB] rounded-[8px] overflow-hidden flex items-center justify-center">
              <img src={IMG_OUTLOOK} alt="Outlook" className="w-[53px] h-[53px] object-contain" />
            </div>
          </div>

          {/* Salesforce icon */}
          <div className="absolute left-1/2 -translate-x-1/2 top-[92px] w-[72px] h-[72px]">
            <div className="w-full h-full backdrop-blur-[2px] bg-white/50 border border-[#EBEBEB] rounded-[8px] overflow-hidden flex items-center justify-center">
              <img src={IMG_SALESFORCE} alt="Salesforce" className="w-[49px] h-[35px] object-contain" />
            </div>
          </div>

          {/* Link icon */}
          <div className="absolute left-[27px] top-[60px]">
            <img src={IMG_LINK_ICON} alt="" className="w-[30px] h-[30px] opacity-60" />
          </div>

          {/* Small calendar icon */}
          <div className="absolute right-[38px] top-[70px] -rotate-[8deg]">
            <img src={IMG_SMALL_CALENDAR} alt="" className="w-[21px] h-[21px] opacity-60" />
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pt-8 pb-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-[28px] font-light leading-[32px] text-black">
              Sales integrations – now available!
            </h2>
            <p className="text-[16px] text-[#7A7A7A] leading-6">
              Connect your calendar and CRM to capture meeting insights and keep your pipeline up to date.
            </p>
            <div className="flex flex-col gap-1 mt-1">
              {FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2">
                  <Check className="w-5 h-5 text-black flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <span className="text-[14px] text-black leading-5">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Button */}
        <div className="px-6 pt-2 pb-4">
          <button
            onClick={handleLearnMore}
            className="w-full h-12 bg-black text-white rounded-[5px] text-[16px] font-semibold"
          >
            Learn more
          </button>
        </div>

        {/* Safe area */}
        <div className="h-[34px]" />

        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center"
        >
          <X className="w-6 h-6 text-black" strokeWidth={2} />
        </button>
      </div>
    </>
  );
}
