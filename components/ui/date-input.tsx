"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  startOfWeek,
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
} from "date-fns";

type Props = {
  value: string; // ISO date: YYYY-MM-DD
  onChange: (v: string) => void;
  name?: string;
  placeholder?: string;
  className?: string;
  weekStartsOn?: 0 | 1; // 0 = Sunday, 1 = Monday
};

function toDate(value?: string) {
  try {
    return value ? parseISO(value) : null;
  } catch {
    return null;
  }
}

export function DateInput({ value, onChange, name, placeholder, className, weekStartsOn = 1 }: Props) {
  const selected = toDate(value) || null;
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState<Date>(selected ?? new Date());
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const displayLabel = selected ? format(selected, "yyyy/MM/dd") : placeholder ?? "yyyy/MM/dd";

  function handleSelect(day: Date) {
    const iso = format(day, "yyyy-MM-dd");
    onChange(iso);
    setOpen(false);
  }

  function renderCalendar() {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn });
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn });

    const weeks: Date[][] = [];
    let cursor = start;
    while (cursor <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cursor);
        cursor = addDays(cursor, 1);
      }
      weeks.push(week);
    }

    return (
      <div className="mt-2 w-[320px] rounded-xl bg-[#222222] p-4 shadow-lg text-sm text-[#D9D9D9]">
        <div className="flex items-center justify-between mb-3">
          <button
            aria-label="Prev month"
            onClick={() => setViewDate((d) => addMonths(d, -1))}
            className="text-white/80 px-2 py-1 hover:text-white"
          >
            ‹
          </button>
          <div className="font-medium">{format(viewDate, "LLLL yyyy")}</div>
          <button
            aria-label="Next month"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            className="text-white/80 px-2 py-1 hover:text-white"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-xs text-[#9B9B9B] mb-2">
          {(
            weekStartsOn === 1
              ? ['Mo','Tu','We','Th','Fr','Sa','Su']
              : ['Su','Mo','Tu','We','Th','Fr','Sa']
          ).map((d) => (
            <div key={d} className="text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weeks.map((week, wi) => (
            <React.Fragment key={wi}>
              {week.map((day) => {
                const isCurrentMonth = isSameMonth(day, viewDate);
                const isSelected = selected ? isSameDay(day, selected) : false;
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleSelect(day)}
                    className={`h-10 w-10 flex items-center justify-center rounded-full transition-colors ${
                      isSelected
                        ? 'bg-white text-black'
                        : isCurrentMonth
                        ? 'text-[#D9D9D9] hover:bg-white/5'
                        : 'text-[#6B6B6B]'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className ?? ""}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); } }}
        className="w-full rounded-full bg-[#F3F3F3]/5 border border-[#E8E8E8]/10 px-4 py-3 flex items-center gap-3 shadow-sm cursor-pointer"
      >
        <div className="flex-1 text-sm text-[#D9D9D9]">{displayLabel}</div>
        <div className="p-2 bg-transparent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-[#D9D9D9]">
            <rect x="3" y="4" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.2" />
            <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      <input name={name} type="hidden" value={value} />

      {open && (
        <div className="absolute z-50 mt-2 right-0">
          {renderCalendar()}
        </div>
      )}
    </div>
  );
}

export default DateInput;
