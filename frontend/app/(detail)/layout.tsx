import { PhoneFrame } from "@/components/layout/phone-frame";
import { StatusBar } from "@/components/layout/status-bar";

export default function DetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <PhoneFrame>
      <StatusBar />
      {children}
    </PhoneFrame>
  );
}
