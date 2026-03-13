"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { X, Plus, MoreHorizontal, ChevronsUpDown, Check, ChevronDown } from "lucide-react";
import { useFilterSort } from "./filter-sort-context";
import { api } from "@/lib/api";

const FILE_TYPES = [
  { label: "All files", count: 145, active: true, icon: "/icons/folder.svg" },
  { label: "Unfiled", count: 12, icon: "/icons/unorganized.svg" },
  { label: "Trash", count: 12, icon: "/icons/delete.svg" },
];

const FOLDERS = [
  { label: "Work meetings", count: 36 },
  { label: "Customer communication", count: 12 },
  { label: "Reading", count: 12 },
  { label: "Reading", count: 12 },
];

const COMES_FROM = [
  { label: "Note", count: 20 },
];

export function FilterSortSheet() {
  const { open, closeModal } = useFilterSort();
  const router = useRouter();

  const [checking, setChecking] = useState(false);

  const handleForSales = async () => {
    setChecking(true);
    try {
      const [crm, calendar] = await Promise.all([
        api.getCrmStatus(),
        api.getCalendarStatus(),
      ]);
      closeModal();
      if (crm.connected || calendar.connected) {
        router.push("/sales");
      } else {
        router.push("/sales/connect");
      }
    } catch {
      closeModal();
      router.push("/integration");
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      {/* Full-cover backdrop */}
      <div
        className={`absolute inset-0 z-40 bg-black/40 transition-opacity duration-200 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeModal}
      />

      {/* Sheet panel */}
      <div
        className={`absolute inset-x-0 bottom-0 z-50 bg-[#F9F9F9] rounded-t-[5px] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "85%" }}
      >
        {/* Header */}
        <div className="px-6">
          <div className="flex items-center justify-between gap-4 py-4 border-b border-[#EBEBEB]">
            <span className="flex-1 text-[28px] font-light leading-[32px] text-black truncate">Filter &amp; Sort</span>
            <button
              onClick={closeModal}
              className="shrink-0 w-6 h-6 flex items-center justify-center"
            >
              <X className="w-6 h-6 text-black" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto pb-8" style={{ maxHeight: "calc(85vh - 80px)" }}>
          {/* Date Created sort */}
          <div className="flex items-center gap-2 px-6 pt-4 h-[40px]">
            <span className="text-[16px] leading-[24px] text-[#7A7A7A]">Date Created</span>
            <ChevronsUpDown className="w-[14px] h-[14px] text-[#7A7A7A]" strokeWidth={2} />
          </div>

          {/* File type list */}
          <div className="flex flex-col mt-4">
            {FILE_TYPES.map((item) => (
              <div key={item.label} className="flex items-center gap-2 px-6 h-[48px]">
                <div className="w-6 h-6 shrink-0">
                  <Image src={item.icon} alt={item.label} width={24} height={24} />
                </div>
                <span className={`flex-1 text-[16px] leading-[24px] ${item.active ? "text-black" : "text-[#3D3D3D]"}`}>
                  {item.label}
                  <span className="text-[#A3A3A3]"> ({item.count})</span>
                </span>
                {item.active && <Check className="w-6 h-6 text-black shrink-0" strokeWidth={2} />}
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="mx-6 border-b border-[#EBEBEB]" />

          {/* Folders */}
          <div className="mt-4">
            <div className="flex items-center justify-between px-6 py-2">
              <span className="text-[20px] leading-[28px] font-normal text-black">Folders</span>
              <button className="w-6 h-6 shrink-0 flex items-center justify-center">
                <Plus className="w-6 h-6 text-black" strokeWidth={1.5} />
              </button>
            </div>
            {FOLDERS.map((folder, i) => (
              <div key={i} className="flex items-center gap-2 px-6 h-[48px]">
                <div className="w-6 h-6 shrink-0">
                  <Image src="/icons/folder.svg" alt="Folder" width={24} height={24} />
                </div>
                <span className="flex-1 text-[16px] leading-[24px] text-[#3D3D3D]">
                  {folder.label}
                  <span className="text-[#A3A3A3]"> ({folder.count})</span>
                </span>
                <button className="shrink-0">
                  <MoreHorizontal className="w-6 h-6 text-[#3D3D3D]" strokeWidth={1.5} />
                </button>
              </div>
            ))}
            {/* View more */}
            <button className="flex items-center justify-center gap-1 h-[40px] w-full">
              <span className="text-[16px] leading-[24px] text-[#7A7A7A]">View more</span>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 8L10 12L14 8" stroke="#7A7A7A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Solutions */}
          <div className="mt-4">
            <div className="px-6 py-2">
              <span className="text-[20px] leading-[28px] font-normal text-black">Solutions</span>
            </div>
            <button
              onClick={handleForSales}
              disabled={checking}
              className="flex items-center px-6 h-[48px] w-full text-left"
            >
              <span className="text-[16px] leading-[24px] text-[#3D3D3D]">
                {checking ? "Checking..." : "For Sales"}
              </span>
            </button>
          </div>

          {/* Comes from */}
          <div className="mt-4">
            <div className="px-6 py-2">
              <span className="text-[20px] leading-[28px] font-normal text-black">Comes from</span>
            </div>
            {COMES_FROM.map((item) => (
              <div key={item.label} className="flex items-center px-6 h-[48px]">
                <span className="text-[16px] leading-[24px] text-[#3D3D3D]">
                  {item.label}
                  <span className="text-[#A3A3A3]"> ({item.count})</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
