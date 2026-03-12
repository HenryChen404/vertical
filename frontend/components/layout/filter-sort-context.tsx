"use client";

import { createContext, useContext, useState } from "react";

interface FilterSortContextType {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
}

const FilterSortContext = createContext<FilterSortContextType>({
  open: false,
  openModal: () => {},
  closeModal: () => {},
});

export function FilterSortProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <FilterSortContext.Provider
      value={{ open, openModal: () => setOpen(true), closeModal: () => setOpen(false) }}
    >
      {children}
    </FilterSortContext.Provider>
  );
}

export function useFilterSort() {
  return useContext(FilterSortContext);
}
