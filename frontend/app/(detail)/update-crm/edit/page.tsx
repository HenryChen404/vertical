"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function UpdateCrmEditPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/update-crm/review");
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center text-[var(--text-gray)]">
      Redirecting...
    </div>
  );
}
