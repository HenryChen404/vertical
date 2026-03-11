"use client";

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-start justify-center bg-gray-200 sm:py-8">
      <div className="w-full sm:w-[402px] min-h-screen sm:min-h-0 sm:h-[874px] bg-[#F9F9F9] sm:rounded-[40px] sm:shadow-2xl overflow-hidden relative flex flex-col sm:border sm:border-gray-300">
        {children}
      </div>
    </div>
  );
}
