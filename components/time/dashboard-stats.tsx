"use client";

import { useState, useMemo } from "react";
import { formatMinutes } from "@/lib/time";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, isAfter } from "date-fns";

/* ── Types ── */
export type DashboardStatsData = {
  todayMinutes: number;
  todayProjectsCount: number;
  activeTimer: {
    projectName: string;
    projectId: string;
    status: "RUNNING" | "PAUSED";
  } | null;
  weekTotalMinutes: number;
  weekStartISO: string;
  weekEndISO: string;
  expectedDayHours: number;
  topProjectToday: {
    projectId: string;
    projectName: string;
    minutes: number;
    sessions: number;
  } | null;
  weekDays: { label: string; minutes: number }[];
  projectEntries: {
    projectId: string;
    projectName: string;
    workDate: string;
    durationMinutes: number;
  }[];
  lastActivityAgo: string | null;
};

/* ── Tiny progress bar ── */
function Bar({ value, max, color = "bg-[#F40000]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full bg-[#808080]/10 overflow-hidden">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Stat card wrapper ── */
function S({ children, className = "", onClick, accent = false }: { children: React.ReactNode; className?: string; onClick?: () => void; accent?: boolean }) {
  return (
    <div className={`py-3 sm:py-4 ${accent ? "border-l-2 border-l-[#F40000] pl-3 sm:pl-4" : ""} ${className}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}>
      {children}
    </div>
  );
}

/* ── Weekly Trend chart with week picker ── */
function WeeklyTrendCard({ entries }: { entries: DashboardStatsData["projectEntries"] }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const now = new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const selectedWeekStart = addWeeks(currentWeekStart, weekOffset);
  const selectedWeekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 });
  const isFutureWeek = weekOffset >= 0;

  const weekLabel = `${format(selectedWeekStart, "d MMM")} – ${format(selectedWeekEnd, "d MMM")}`;

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const weekDays = useMemo(() => {
    return dayLabels.map((label, i) => {
      const d = new Date(selectedWeekStart);
      d.setDate(selectedWeekStart.getDate() + i);
      const dateStr = format(d, "yyyy-MM-dd");
      const minutes = entries
        .filter((e) => e.workDate === dateStr)
        .reduce((s, e) => s + e.durationMinutes, 0);
      return { label, minutes };
    });
  }, [entries, selectedWeekStart]);

  const weekMax = Math.max(...weekDays.map((d) => d.minutes), 1);

  return (
    <S className="hidden lg:block">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-sm sm:text-base font-bold">Weekly Trend</div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1"
          >
            ‹
          </button>
          <span className="text-[10px] text-[#D9D9D9] font-bold tabular-nums">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            disabled={isFutureWeek}
            className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      </div>
      <div className="flex items-end gap-1.5 h-16">
        {weekDays.map((day) => (
          <div key={day.label} className="flex-1 flex flex-col justify-end h-full">
            <div
              className={`w-full rounded-t transition-all ${day.minutes > 0 ? "bg-[#F40000]" : "bg-[#808080]/15"}`}
              style={{ height: `${weekMax > 0 ? Math.max(4, (day.minutes / weekMax) * 100) : 4}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {weekDays.map((day) => (
          <div key={day.label} className="flex-1 text-center">
            <div className="text-[10px] text-[#808080]">{day.label}</div>
            <div className="text-[10px] font-bold text-[#D9D9D9] tabular-nums">
              {day.minutes > 0 ? formatMinutes(day.minutes) : "—"}
            </div>
          </div>
        ))}
      </div>
    </S>
  );
}

/* ── Project Time chart with week picker ── */
function ProjectTimeCard({ entries }: { entries: DashboardStatsData["projectEntries"] }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const now = new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

  const selectedWeekStart = addWeeks(currentWeekStart, weekOffset);
  const selectedWeekEnd = endOfWeek(selectedWeekStart, { weekStartsOn: 1 });
  const isFutureWeek = isAfter(addWeeks(selectedWeekStart, 1), currentWeekStart) && weekOffset >= 0;

  const weekLabel = `${format(selectedWeekStart, "d MMM")} – ${format(selectedWeekEnd, "d MMM")}`;

  const projectTotals = useMemo(() => {
    const wkStart = format(selectedWeekStart, "yyyy-MM-dd");
    const wkEnd = format(selectedWeekEnd, "yyyy-MM-dd");

    const map = new Map<string, { projectId: string; projectName: string; minutes: number }>();
    for (const e of entries) {
      if (e.workDate >= wkStart && e.workDate <= wkEnd) {
        const prev = map.get(e.projectId) ?? { projectId: e.projectId, projectName: e.projectName, minutes: 0 };
        prev.minutes += e.durationMinutes;
        map.set(e.projectId, prev);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes);
  }, [entries, selectedWeekStart, selectedWeekEnd]);

  const maxMinutes = Math.max(...projectTotals.map((p) => p.minutes), 1);

  return (
    <S className="hidden lg:block">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm sm:text-base font-bold">Project Time</div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((v) => v - 1)}
            className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1"
          >
            ‹
          </button>
          <span className="text-[10px] text-[#D9D9D9] font-bold tabular-nums">{weekLabel}</span>
          <button
            onClick={() => setWeekOffset((v) => v + 1)}
            disabled={isFutureWeek}
            className="text-sm text-[#808080] hover:text-[#D9D9D9] transition-colors px-1 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            ›
          </button>
        </div>
      </div>

      {projectTotals.length > 0 ? (
        <div className="space-y-2">
          {projectTotals.map((p) => (
            <div key={p.projectId}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-[#D9D9D9] truncate max-w-[70%]">{p.projectName}</span>
                <span className="text-xs font-bold tabular-nums text-[#D9D9D9] shrink-0">{formatMinutes(p.minutes)}</span>
              </div>
              <div className="h-2 w-full bg-[#808080]/10 overflow-hidden">
                <div
                  className="h-full bg-[#F40000] transition-all"
                  style={{ width: `${(p.minutes / maxMinutes) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-[#808080] mt-1">No time logged this week</div>
      )}
    </S>
  );
}

export function DashboardStats({ data, onTodayClick }: { data: DashboardStatsData; onTodayClick?: () => void }) {
  const remainingMinutes = Math.max(0, data.expectedDayHours * 60 - data.todayMinutes);
  const weekMax = Math.max(...data.weekDays.map((d) => d.minutes), 1);
  const daysTracked = data.weekDays.filter((d) => d.minutes > 0).length || 1;
  const avgPerDay = data.weekTotalMinutes / daysTracked;
  const weekLabel = `${format(new Date(data.weekStartISO), "d MMM")} – ${format(new Date(data.weekEndISO), "d MMM")}`;

  return (
    <div className="grid grid-cols-2 gap-0 lg:grid-cols-1 lg:divide-y lg:divide-[#808080]/10 lg:gap-y-6">
      {/* ── 1. Today's Activity ── */}
      <S accent className={onTodayClick ? "cursor-pointer hover:bg-[#F8F8F8]/5 transition-colors" : ""} onClick={onTodayClick}>
        <div className="text-sm sm:text-base font-bold">Today</div>
        <div className="text-lg lg:text-xl font-bold tabular-nums mt-1">{formatMinutes(data.todayMinutes)}</div>
        <div className="text-xs text-[#808080] mt-1 space-y-0.5">
          <div>{data.todayProjectsCount} project{data.todayProjectsCount !== 1 ? "s" : ""} worked on</div>
          {data.lastActivityAgo && <div>Last: {data.lastActivityAgo}</div>}
        </div>
      </S>

      {/* ── 2. Remaining Today ── */}
      <S>
        <div className="text-sm sm:text-base font-bold">Remaining Today</div>
        <div className={`text-lg lg:text-xl font-bold tabular-nums mt-1 ${remainingMinutes > 0 ? "" : "text-green-400"}`}>
          {remainingMinutes > 0 ? formatMinutes(remainingMinutes) : "✓ Done"}
        </div>
        <Bar
          value={data.todayMinutes}
          max={data.expectedDayHours * 60}
          color={data.todayMinutes >= data.expectedDayHours * 60 ? "bg-green-400" : "bg-[#F40000]"}
        />
        <div className="text-xs text-[#808080] mt-1">
          {formatMinutes(data.todayMinutes)} / {data.expectedDayHours}h target
        </div>
      </S>

      {/* ── 4. This Week ── */}
      <S>
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">
          Week · {weekLabel}
        </div>
        <div className="text-lg lg:text-xl font-bold tabular-nums mt-1">{formatMinutes(data.weekTotalMinutes)}</div>
        <div className="text-xs text-[#808080] mt-1">
          Avg {formatMinutes(Math.round(avgPerDay))}/day
        </div>
      </S>

      {/* ── 5. Weekly Trend (desktop sidebar only) ── */}
      <WeeklyTrendCard entries={data.projectEntries} />

      {/* ── 6. Project Time (desktop sidebar only) ── */}
      <ProjectTimeCard entries={data.projectEntries} />

    </div>
  );
}
