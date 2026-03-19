"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

const ICON_CLOUD = "/icons/cloud.svg";
const ICON_DESKTOP = "/icons/desktop.svg";
const ICON_TEMPLATE = "/icons/template.svg";
const ICON_AUTOFLOW = "/icons/autoflow.svg";
const ICON_INTEGRATIONS = "/icons/integrations.svg";
const ICON_SHARE = "/icons/share.svg";
const ICON_REFER = "/icons/refer.svg";
const ICON_PRIVACY = "/icons/privacy.svg";
const ICON_HELP = "/icons/help.svg";
const ICON_PLAUD = "/icons/plaud-icon.svg";

interface ExploreRowProps {
  icon: string;
  label: string;
  detail?: string;
  href?: string;
  showNew?: boolean;
}

function ExploreRow({ icon, label, detail, href, showNew }: ExploreRowProps) {
  const content = (
    <div className="flex items-center gap-2 py-3 w-full">
      <div className="w-6 h-6 flex-shrink-0 flex items-center justify-center">
        <img src={icon} alt="" className="w-[22px] h-[22px] object-contain" />
      </div>
      <span className="text-[16px] leading-6 text-[#3D3D3D] flex-1">
        {label}
      </span>
      {showNew && (
        <span className="w-[5px] h-[5px] rounded-full bg-[#FB2C36]" />
      )}
      {detail && (
        <span className="text-[14px] leading-5 text-[#7A7A7A] text-right">
          {detail}
        </span>
      )}
      <ChevronRight className="w-2 h-5 text-black/20" strokeWidth={2} />
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

export default function ExplorePage() {
  return (
    <div className="flex flex-col flex-1 overflow-auto bg-[#F9F9F9]">
      {/* Member card - black header, extends behind status bar */}
      <div className="bg-black px-6 pb-6 pt-2 flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-[44px] font-light leading-[52px] text-white">
            Unlimited
          </p>
          <div className="h-1 w-full bg-[#333] rounded-full overflow-hidden">
            <div className="h-full w-full bg-[#8F53ED]" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[16px] leading-6 text-white">∞ Unlimited mins</p>
          <div className="flex items-center gap-2">
            <span className="text-[14px] leading-5 text-[#A3A3A3]">
              More details
            </span>
            <ChevronRight className="w-2 h-5 text-white/20" strokeWidth={2} />
          </div>
        </div>
      </div>

      {/* Explore list */}
      <div className="px-6 pt-6 flex flex-col">
        {/* Title */}
        <div className="pb-4 border-b border-[#EBEBEB]">
          <h1 className="text-[44px] font-light leading-[52px]">Explore</h1>
        </div>

        {/* Section 1 */}
        <div className="flex flex-col border-b border-[#EBEBEB] py-4">
          <ExploreRow icon={ICON_CLOUD} label="Private Cloud Sync" detail="On" />
          <ExploreRow icon={ICON_DESKTOP} label="Plaud Desktop" detail="Mac / Windows / Web" />
        </div>

        {/* Section 2 */}
        <div className="flex flex-col border-b border-[#EBEBEB] py-4">
          <ExploreRow icon={ICON_TEMPLATE} label="Template Community" />
          <ExploreRow icon={ICON_AUTOFLOW} label="AutoFlow" />
          <ExploreRow
            icon={ICON_INTEGRATIONS}
            label="Integrations"
            href="/integration"
            showNew
          />
        </div>

        {/* Section 3 */}
        <div className="flex flex-col border-b border-[#EBEBEB] py-4">
          <ExploreRow icon={ICON_SHARE} label="Share ideas" />
          <ExploreRow icon={ICON_REFER} label="Refer a friend" />
        </div>

        {/* Section 4 */}
        <div className="flex flex-col py-4">
          <ExploreRow icon={ICON_PRIVACY} label="Privacy & security" />
          <ExploreRow icon={ICON_HELP} label="Help & Support" />
          <ExploreRow icon={ICON_PLAUD} label="About Plaud" />
        </div>
      </div>
    </div>
  );
}
