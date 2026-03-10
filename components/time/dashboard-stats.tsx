"use client";

import { formatMinutes } from "@/lib/time";

/* ── Types ── */
type ActiveTimerInfo = {
  projectName: string;
  projectId: string;
  status: "RUNNING" | "PAUSED";
  accumulatedSeconds: number;
  lastResumedAt: string | null;
} | null;

type ProjectMinutes = {
  projectId: string;
  projectName: string;
  minutes: number;
  sessions: number;
};

type DayMinutes = {
  label: string; // "Mon", "Tue" ...
  minutes: number;
};

type StaleProject = {
  projectId: string;
  projectName: string;
  daysSince: number;
};

type RecentEntry = {
  projectName: string;
  projectId: string;
  durationMinutes: number;
  source: string;
};

export type DashboardStatsData = {
  todayMinutes: number;
  todayProjectsCount: number;
  activeTimer: ActiveTimerInfo;
  weekTotalMinutes: number;
  expectedDayHours: number;
  topProjectToday: ProjectMinutes | null;
  weekDays: DayMinutes[];
  recentEntries: RecentEntry[];
  staleProjects: StaleProject[];
  lastActivityAgo: string | null;
};

/* ── Tiny bar helper ── */
function Bar({ value, max, color = "bg-[#F40000]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-full w-full rounded bg-[#808080]/10 overflow-hidden">
      <div className={`h-full rounded ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function DashboardStats({ data }: { data: DashboardStatsData }) {
  const remainingMinutes = Math.max(0, data.expectedDayHours * 60 - data.todayMinutes);
  const weekMax = Math.max(...data.weekDays.map((d) => d.minutes), 1);
  const daysTracked = data.weekDays.filter((d) => d.minutes > 0).length || 1;
  const avgPerDay = data.weekTotalMinutes / daysTracked;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* ── ROW 1: Four metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {/* Today's tracked */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Today</div>
          <div className="text-lg sm:text-xl font-bold tabular-nums">{formatMinutes(data.todayMinutes)}</div>
          <div className="text-[10px] sm:text-xs text-[#808080] space-y-0.5">
            <div>{data.todayProjectsCount} project{data.todayProjectsCount !== 1 ? "s" : ""} worked on</div>
            {data.lastActivityAgo && <div>Last activity: {data.lastActivityAgo}</div>}
          </div>
        </div>

        {/* Active timer */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Active Timer</div>
          {data.activeTimer ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className={`text-xs ${data.activeTimer.status === "RUNNING" ? "text-[#F40000]" : "text-[#808080]"}`}>●</span>
                <span className="text-sm sm:text-base font-bold truncate">{data.activeTimer.projectName}</span>
              </div>
              <div className="text-[10px] sm:text-xs text-[#808080]">
                {data.activeTimer.projectId} · {data.activeTimer.status === "RUNNING" ? "Running" : "Paused"}
              </div>
            </>
          ) : (
            <div className="text-sm text-[#808080]">No timer running</div>
          )}
        </div>

        {/* Remaining today */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Remaining Today</div>
          <div className={`text-lg sm:text-xl font-bold tabular-nums ${remainingMinutes > 0 ? "text-[#D9D9D9]" : "text-green-400"}`}>
            {remainingMinutes > 0 ? formatMinutes(remainingMinutes) : "✓ Done"}
          </div>
          <div className="h-1.5 w-full">
            <Bar value={data.todayMinutes} max={data.expectedDayHours * 60} color={data.todayMinutes >= data.expectedDayHours * 60 ? "bg-green-400" : "bg-[#F40000]"} />
          </div>
          <div className="text-[10px] text-[#808080]">
            {formatMinutes(data.todayMinutes)} / {data.expectedDayHours}h target
          </div>
        </div>

        {/* Week total */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">This Week</div>
          <div className="text-lg sm:text-xl font-bold tabular-nums">{formatMinutes(data.weekTotalMinutes)}</div>
          <div className="text-[10px] sm:text-xs text-[#808080] space-y-0.5">
            <div>Avg {formatMinutes(Math.round(avgPerDay))}/day</div>
          </div>
        </div>
      </div>

      {/* ── ROW 2: Three info panels ── */}
      <div className="grid gap-2 sm:gap-3 md:grid-cols-3">
        {/* Top project today */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Top Project Today</div>
          {data.topProjectToday ? (
            <>
              <div className="font-bold text-sm sm:text-base truncate">
                {data.topProjectToday.projectName}
              </div>
              <div className="text-[10px] sm:text-xs text-[#808080]">
                {data.topProjectToday.projectId} · {formatMinutes(data.topProjectToday.minutes)} tracked · {data.topProjectToday.sessions} session{data.topProjectToday.sessions !== 1 ? "s" : ""}
              </div>
            </>
          ) : (
            <div className="text-xs text-[#808080]">No activity today yet</div>
          )}
        </div>

        {/* Weekly distribution mini chart */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Weekly Distribution</div>
          <div className="flex items-end gap-1.5 h-16 sm:h-20">
            {data.weekDays.map((day) => (
              <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex-1 flex flex-col justify-end">
                  <div
                    className={`w-full rounded-t transition-all ${day.minutes > 0 ? "bg-[#F40000]" : "bg-[#808080]/20"}`}
                    style={{ height: `${weekMax > 0 ? Math.max(2, (day.minutes / weekMax) * 100) : 2}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5">
            {data.weekDays.map((day) => (
              <div key={day.label} className="flex-1 text-center">
                <div className="text-[9px] text-[#808080]">{day.label}</div>
                <div className="text-[9px] font-bold text-[#D9D9D9] tabular-nums">{day.minutes > 0 ? formatMinutes(day.minutes) : "—"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-xl border border-[#808080]/30 p-3 sm:p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[#808080] font-bold">Recent Activity</div>
          {data.recentEntries.length > 0 ? (
            <div className="space-y-1.5">
              {data.recentEntries.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="font-bold tabular-nums text-[#D9D9D9] shrink-0">{formatMinutes(entry.durationMinutes)}</span>
                  <span className="text-[#808080]">—</span>
                  <span className="truncate">{entry.projectName}</span>
                  <span className={`shrink-0 text-[9px] rounded-full px-1.5 py-0.5 ${
                    entry.source === "TIMER"
                      ? "bg-[#F40000]/15 text-[#F40000]"
                      : "bg-[#808080]/15 text-[#808080]"
                  }`}>
                    {entry.source === "TIMER" ? "⏱" : "✏"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-[#808080]">No entries yet today</div>
          )}
        </div>
      </div>

      {/* ── ROW 3: Stale projects warning (only when relevant) ── */}
      {data.staleProjects.length > 0 && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-3 sm:p-4 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-yellow-400 font-bold">⚠ No Activity in 3+ Days</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {data.staleProjects.map((p) => (
              <div key={p.projectId} className="text-xs text-[#D9D9D9]">
                {p.projectName} <span className="text-[#808080]">({p.projectId}) · {p.daysSince}d ago</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
