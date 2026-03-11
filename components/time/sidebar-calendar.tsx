"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isToday,
  isSameMonth,
  isFuture,
} from "date-fns";

export function SidebarCalendar({
  entryDates,
  selectedDate,
  onDateSelect,
}: {
  entryDates: string[];
  selectedDate?: string | null;
  onDateSelect?: (date: string) => void;
}) {
  const [month, setMonth] = useState(new Date());
  const entrySet = useMemo(() => new Set(entryDates), [entryDates]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="pt-3 mt-1 border-t border-[#808080]/15 hidden lg:block">
      {/* Month header with nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setMonth((m) => subMonths(m, 1))}
          className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1"
        >
          ‹
        </button>
        <span className="text-xs font-bold uppercase tracking-wider">
          {format(month, "MMMM yyyy")}
        </span>
        <button
          onClick={() => setMonth((m) => addMonths(m, 1))}
          className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1"
        >
          ›
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-0.5">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-[11px] text-center text-[#808080] font-bold py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          const future = isFuture(day) && !today;
          const hasEntry = entrySet.has(key);
          const isSelected = selectedDate === key;
          const clickable = inMonth && !future;

          return (
            <button
              key={key}
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onDateSelect?.(key)}
              className={`relative text-xs text-center py-1 transition-colors ${
                !inMonth
                  ? "text-[#808080]/20 cursor-default"
                  : future
                    ? "text-[#808080]/25 cursor-not-allowed"
                    : today
                      ? "bg-[#F40000] text-white font-bold hover:bg-[#F40000]/80 cursor-pointer"
                      : hasEntry
                        ? "text-[#F8F8F8] font-bold hover:bg-[#F8F8F8]/10 cursor-pointer"
                        : "text-[#808080]/60 hover:bg-[#F8F8F8]/5 cursor-pointer"
              } ${isSelected && !today ? "ring-1 ring-[#F40000] bg-[#F40000]/10" : ""} ${isSelected && today ? "ring-1 ring-white" : ""}`}
            >
              {format(day, "d")}
              {hasEntry && !today && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F40000]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date indicator */}
      {selectedDate && (
        <div className="mt-2 flex items-center justify-between border-t border-[#808080]/20 pt-2">
          <span className="text-xs text-[#D9D9D9]">
            📅 <span className="font-bold">{format(new Date(selectedDate + "T12:00:00"), "dd MMM yyyy")}</span>
          </span>
          <button
            onClick={() => onDateSelect?.(selectedDate)}
            className="text-xs text-[#808080] hover:text-[#D9D9D9] transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
