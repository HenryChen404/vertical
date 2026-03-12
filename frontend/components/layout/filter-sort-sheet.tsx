"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, MoreHorizontal, ChevronDown, Check, Folder, Trash2, FolderOpen } from "lucide-react";
import { useFilterSort } from "./filter-sort-context";
import { api } from "@/lib/api";

const FILE_TYPES = [
  { label: "All files", count: 145, active: true, icon: "folder-open" },
  { label: "Unfiled", count: 12, icon: "folder" },
  { label: "Trash", count: 12, icon: "trash" },
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
        className={`absolute inset-x-0 bottom-0 z-50 bg-white rounded-t-[16px] transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ maxHeight: "85%" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-[4px] bg-[#D1D5DB] rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-[17px] font-semibold text-[#1A1A1A]">Filter &amp; Sort</span>
          <button
            onClick={closeModal}
            className="w-7 h-7 rounded-full bg-[#F0F0F0] flex items-center justify-center"
          >
            <X className="w-4 h-4 text-[#3D3D3D]" strokeWidth={2.5} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: "calc(85vh - 90px)" }}>
          {/* Date Created sort */}
          <div className="flex items-center gap-1 py-3 border-b border-[#F0F0F0]">
            <span className="text-[13px] text-[#7A7A7A]">Date Created</span>
            <ChevronDown className="w-3 h-3 text-[#7A7A7A]" strokeWidth={2} />
          </div>

          {/* File type list */}
          <div className="py-2 flex flex-col border-b border-[#F0F0F0]">
            {FILE_TYPES.map((item) => (
              <div key={item.label} className="flex items-center gap-3 py-2.5">
                <div className="w-5 h-5 flex items-center justify-center text-[#3D3D3D]">
                  {item.icon === "folder-open" && <FolderOpen className="w-5 h-5" strokeWidth={1.5} />}
                  {item.icon === "folder" && <Folder className="w-5 h-5" strokeWidth={1.5} />}
                  {item.icon === "trash" && <Trash2 className="w-5 h-5" strokeWidth={1.5} />}
                </div>
                <span className="flex-1 text-[15px] text-[#1A1A1A]">
                  {item.label}{" "}
                  <span className="text-[#A3A3A3] font-normal">({item.count})</span>
                </span>
                {item.active && <Check className="w-[18px] h-[18px] text-[#1A1A1A]" strokeWidth={2.5} />}
              </div>
            ))}
          </div>

          {/* Folders */}
          <div className="py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[15px] font-semibold text-[#1A1A1A]">Folders</span>
              <button className="w-7 h-7 flex items-center justify-center">
                <Plus className="w-5 h-5 text-[#3D3D3D]" strokeWidth={2} />
              </button>
            </div>
            {FOLDERS.map((folder, i) => (
              <div key={i} className="flex items-center gap-3 py-2.5">
                <div className="w-6 h-6 flex items-center justify-center">
                  <Folder className="w-4.5 h-4.5 text-[#3D3D3D]" strokeWidth={1.5} />
                </div>
                <span className="flex-1 text-[15px] text-[#3D3D3D]">
                  {folder.label}{" "}
                  <span className="text-[#A3A3A3]">({folder.count})</span>
                </span>
                <button>
                  <MoreHorizontal className="w-4 h-4 text-[#A3A3A3]" />
                </button>
              </div>
            ))}
            {/* View more */}
            <button className="flex items-center justify-center gap-1 mt-1 py-1 w-full">
              <span className="text-[14px] text-[#3D3D3D]">View more</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#3D3D3D]" strokeWidth={2} />
            </button>
          </div>

          {/* Solutions */}
          <div className="py-3">
            <span className="text-[15px] font-semibold text-[#1A1A1A]">Solutions</span>
            <button
              onClick={handleForSales}
              disabled={checking}
              className="flex items-center gap-2 mt-2 py-2 w-full text-left"
            >
              <span className="text-[15px] text-[#3D3D3D]">
                {checking ? "Checking..." : "For Sales"}
              </span>
            </button>
          </div>

          {/* Comes from */}
          <div className="py-3">
            <span className="text-[15px] font-semibold text-[#1A1A1A]">Comes from</span>
            <div className="mt-2">
              {COMES_FROM.map((item) => (
                <div key={item.label} className="flex items-center gap-1 py-2">
                  <span className="text-[15px] text-[#3D3D3D]">
                    {item.label}{" "}
                    <span className="text-[#A3A3A3]">({item.count})</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
