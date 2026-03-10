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
} from "date-fns";

export function SidebarCalendar({ entryDates }: { entryDates: string[] }) {
  const [month, setMonth] = useState(new Date());
  const entrySet = useMemo(() => new Set(entryDates), [entryDates]);

  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  return (
    <div className="rounded-xl border border-[#808080]/30 p-3 hidden lg:block">
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
          const hasEntry = entrySet.has(key);

          return (
            <div
              key={key}
              className={`relative text-xs text-center py-1 rounded transition-colors ${
                !inMonth
                  ? "text-[#808080]/20"
                  : today
                    ? "bg-[#F40000] text-white font-bold"
                    : hasEntry
                      ? "text-[#F8F8F8] font-bold"
                      : "text-[#808080]/60"
              }`}
            >
              {format(day, "d")}
              {hasEntry && !today && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#F40000]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
