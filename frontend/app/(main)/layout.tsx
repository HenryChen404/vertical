import { PhoneFrame } from "@/components/layout/phone-frame";
import { StatusBar } from "@/components/layout/status-bar";
import { BottomTabBar } from "@/components/layout/bottom-tab-bar";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame>
      <StatusBar />
      <div className="flex-1 overflow-y-auto">{children}</div>
      <BottomTabBar />
    </PhoneFrame>
  );
}
