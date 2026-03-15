"use client";

import React from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
  name?: string;
  placeholder?: string;
  className?: string;
};

export function DateInput({ value, onChange, name, placeholder, className }: Props) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="w-full border border-[#808080]/30 bg-black pr-10 pl-3 py-2 text-xs sm:text-sm flex items-center">
        <span className={`text-xs ${value ? "text-[#D9D9D9]" : "text-[#808080]"}`}>{value || placeholder || "dd/mm/yyyy"}</span>
      </div>
      <input
        name={name}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={name ?? "date"}
      />
      <span className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
        <img src="/calendar-icon.svg" alt="calendar" width={20} height={20} />
      </span>
    </div>
  );
}

export default DateInput;
