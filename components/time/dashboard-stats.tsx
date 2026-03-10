"use client";

import { formatMinutes } from "@/lib/time";
import { format } from "date-fns";

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
  recentEntries: {
    projectName: string;
    projectId: string;
    durationMinutes: number;
    source: string;
  }[];
  staleProjects: {
    projectId: string;
    projectName: string;
    daysSince: number;
  }[];
  lastActivityAgo: string | null;
};

/* ── Tiny progress bar ── */
function Bar({ value, max, color = "bg-[#F40000]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-full rounded bg-[#808080]/10 overflow-hidden">
      <div className={`h-full rounded ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ── Stat card wrapper ── */
function S({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#808080]/30 p-3 sm:p-4 ${className}`}>
      {children}
    </div>
  );
}

export function DashboardStats({ data }: { data: DashboardStatsData }) {
  const remainingMinutes = Math.max(0, data.expectedDayHours * 60 - data.todayMinutes);
  const weekMax = Math.max(...data.weekDays.map((d) => d.minutes), 1);
  const daysTracked = data.weekDays.filter((d) => d.minutes > 0).length || 1;
  const avgPerDay = data.weekTotalMinutes / daysTracked;
  const weekLabel = `${format(new Date(data.weekStartISO), "d MMM")} – ${format(new Date(data.weekEndISO), "d MMM")}`;

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
      {/* ── 1. Today's Activity ── */}
      <S>
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">Today</div>
        <div className="text-xl lg:text-2xl font-bold tabular-nums mt-0.5">{formatMinutes(data.todayMinutes)}</div>
        <div className="text-xs text-[#808080] mt-0.5 space-y-px">
          <div>{data.todayProjectsCount} project{data.todayProjectsCount !== 1 ? "s" : ""} worked on</div>
          {data.lastActivityAgo && <div>Last: {data.lastActivityAgo}</div>}
        </div>
      </S>

      {/* ── 2. Active Timer ── */}
      <S>
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">Active Timer</div>
        {data.activeTimer ? (
          <div className="mt-0.5">
            <div className="flex items-center gap-1.5">
              <span className={`text-xs ${data.activeTimer.status === "RUNNING" ? "text-[#F40000]" : "text-[#808080]"}`}>●</span>
              <span className="text-sm font-bold truncate">{data.activeTimer.projectName}</span>
            </div>
            <div className="text-xs text-[#808080] mt-px">
              {data.activeTimer.projectId} · {data.activeTimer.status === "RUNNING" ? "Running" : "Paused"}
            </div>
          </div>
        ) : (
          <div className="text-sm text-[#808080] mt-1">No timer running</div>
        )}
      </S>

      {/* ── 3. Remaining Today ── */}
      <S>
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">Remaining Today</div>
        <div className={`text-xl lg:text-2xl font-bold tabular-nums mt-0.5 ${remainingMinutes > 0 ? "" : "text-green-400"}`}>
          {remainingMinutes > 0 ? formatMinutes(remainingMinutes) : "✓ Done"}
        </div>
        <Bar
          value={data.todayMinutes}
          max={data.expectedDayHours * 60}
          color={data.todayMinutes >= data.expectedDayHours * 60 ? "bg-green-400" : "bg-[#F40000]"}
        />
        <div className="text-xs text-[#808080] mt-0.5">
          {formatMinutes(data.todayMinutes)} / {data.expectedDayHours}h target
        </div>
      </S>

      {/* ── 4. This Week ── */}
      <S>
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">
          Week · {weekLabel}
        </div>
        <div className="text-xl lg:text-2xl font-bold tabular-nums mt-0.5">{formatMinutes(data.weekTotalMinutes)}</div>
        <div className="text-xs text-[#808080] mt-0.5">
          Avg {formatMinutes(Math.round(avgPerDay))}/day
        </div>
      </S>

      {/* ── 5. Top Project Today (desktop sidebar only) ── */}
      <S className="hidden lg:block">
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">Top Project Today</div>
        {data.topProjectToday ? (
          <div className="mt-0.5">
            <div className="text-sm font-bold truncate">{data.topProjectToday.projectName}</div>
            <div className="text-xs text-[#808080]">
              {data.topProjectToday.projectId} · {formatMinutes(data.topProjectToday.minutes)} · {data.topProjectToday.sessions} session{data.topProjectToday.sessions !== 1 ? "s" : ""}
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#808080] mt-1">No activity yet</div>
        )}
      </S>

      {/* ── 6. Weekly Trend (desktop sidebar only) ── */}
      <S className="hidden lg:block">
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold mb-1.5">Weekly Trend</div>
        <div className="flex items-end gap-1 h-12">
          {data.weekDays.map((day) => (
            <div key={day.label} className="flex-1 flex flex-col justify-end h-full">
              <div
                className={`w-full rounded-t transition-all ${day.minutes > 0 ? "bg-[#F40000]" : "bg-[#808080]/15"}`}
                style={{ height: `${weekMax > 0 ? Math.max(4, (day.minutes / weekMax) * 100) : 4}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-1">
          {data.weekDays.map((day) => (
            <div key={day.label} className="flex-1 text-center">
              <div className="text-[10px] text-[#808080]">{day.label}</div>
              <div className="text-[10px] font-bold text-[#D9D9D9] tabular-nums">
                {day.minutes > 0 ? formatMinutes(day.minutes) : "—"}
              </div>
            </div>
          ))}
        </div>
      </S>

      {/* ── 7. Recent Activity (desktop sidebar only) ── */}
      <S className="hidden lg:block">
        <div className="text-xs uppercase tracking-wider text-[#808080] font-bold">Recent</div>
        {data.recentEntries.length > 0 ? (
          <div className="mt-1 space-y-1.5">
            {data.recentEntries.map((entry, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="font-bold tabular-nums text-[#D9D9D9] shrink-0">{formatMinutes(entry.durationMinutes)}</span>
                <span className="text-[#808080]">—</span>
                <span className="truncate">{entry.projectName}</span>
                <span className={`shrink-0 text-[10px] ${
                  entry.source === "TIMER" ? "text-[#F40000]" : "text-[#808080]"
                }`}>
                  {entry.source === "TIMER" ? "⏱" : "✏"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[#808080] mt-1">No entries yet</div>
        )}
      </S>

      {/* ── 8. Stale Projects (desktop sidebar only, conditional) ── */}
      {data.staleProjects.length > 0 && (
        <div className="hidden lg:block rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 sm:p-4">
          <div className="text-xs uppercase tracking-wider text-yellow-400 font-bold">⚠ No Activity 3+ Days</div>
          <div className="mt-1 space-y-1">
            {data.staleProjects.map((p) => (
              <div key={p.projectId} className="text-xs text-[#D9D9D9]">
                {p.projectName} <span className="text-[#808080]">· {p.daysSince}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
