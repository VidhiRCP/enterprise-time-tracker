"use client";

import { useState, useMemo } from "react";
import { format, addDays } from "date-fns";

/* ── Types ── */
type EntryRow = {
  projectId: string;
  projectName: string;
  workDate: string;         // "YYYY-MM-DD"
  durationMinutes: number;
  startedAt: string | null;
  stoppedAt: string | null;
};

type AllocRow = {
  projectId: string;
  projectName: string;
  eventDate: string;        // "YYYY-MM-DD"
  durationMin: number;
};

type InsightsData = {
  entries: EntryRow[];
  allocations: AllocRow[];
  currentWeekISO: string;   // Monday ISO of current week
};

/* ── Helpers ── */
function fmtMin(mins: number) {
  if (mins === 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1);
}

/** Wall-clock duration for timer entries — truncate to displayed minute */
function effectiveMin(e: EntryRow): number {
  if (e.startedAt && e.stoppedAt) {
    const start = new Date(e.startedAt);
    const stop = new Date(e.stoppedAt);
    start.setSeconds(0, 0);
    stop.setSeconds(0, 0);
    return Math.max(1, Math.round((stop.getTime() - start.getTime()) / 60_000));
  }
  return e.durationMinutes;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const PROJECT_COLORS = [
  "#F40000", "#3B82F6", "#22C55E", "#F59E0B", "#A855F7",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

/* ── Main Component ── */
export function InsightsPanel({ data }: { data: InsightsData }) {
  const { entries, allocations, currentWeekISO } = data;
  const currentMonday = new Date(currentWeekISO);

  const [weekOffset, setWeekOffset] = useState(0);

  // Compute selected week boundaries
  const selectedMonday = useMemo(() => {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [currentMonday, weekOffset]);

  const selectedSunday = useMemo(() => addDays(selectedMonday, 6), [selectedMonday]);

  const weekLabel = useMemo(
    () => `${format(selectedMonday, "d MMM")} – ${format(selectedSunday, "d MMM yyyy")}`,
    [selectedMonday, selectedSunday],
  );

  // Filter data for selected week
  const weekStart = useMemo(() => selectedMonday.toISOString().slice(0, 10), [selectedMonday]);
  const weekEnd = useMemo(() => selectedSunday.toISOString().slice(0, 10), [selectedSunday]);

  const weekEntries = useMemo(
    () => entries.filter((e) => e.workDate >= weekStart && e.workDate <= weekEnd),
    [entries, weekStart, weekEnd],
  );

  const weekAllocs = useMemo(
    () => allocations.filter((a) => a.eventDate >= weekStart && a.eventDate <= weekEnd),
    [allocations, weekStart, weekEnd],
  );

  // Aggregate into daily breakdown + project totals
  const { dailyBreakdown, projectTotals, totalMinutes, totalActivityMin, totalMeetingMin } = useMemo(() => {
    const map = new Map<string, Map<string, { projectName: string; activityMin: number; meetingMin: number }>>();

    for (const e of weekEntries) {
      if (!map.has(e.workDate)) map.set(e.workDate, new Map());
      const dayMap = map.get(e.workDate)!;
      const ex = dayMap.get(e.projectId) ?? { projectName: e.projectName, activityMin: 0, meetingMin: 0 };
      ex.activityMin += effectiveMin(e);
      dayMap.set(e.projectId, ex);
    }

    for (const a of weekAllocs) {
      if (!map.has(a.eventDate)) map.set(a.eventDate, new Map());
      const dayMap = map.get(a.eventDate)!;
      const ex = dayMap.get(a.projectId) ?? { projectName: a.projectName, activityMin: 0, meetingMin: 0 };
      ex.meetingMin += a.durationMin;
      dayMap.set(a.projectId, ex);
    }

    const dailyBreakdown = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayMap]) => ({
        date,
        projects: Array.from(dayMap.entries())
          .map(([projectId, d]) => ({
            projectId,
            projectName: d.projectName,
            activityMin: d.activityMin,
            meetingMin: d.meetingMin,
            totalMin: d.activityMin + d.meetingMin,
          }))
          .sort((a, b) => b.totalMin - a.totalMin),
      }));

    const ptMap = new Map<string, { projectName: string; activityMin: number; meetingMin: number }>();
    for (const day of dailyBreakdown) {
      for (const p of day.projects) {
        const ex = ptMap.get(p.projectId) ?? { projectName: p.projectName, activityMin: 0, meetingMin: 0 };
        ex.activityMin += p.activityMin;
        ex.meetingMin += p.meetingMin;
        ptMap.set(p.projectId, ex);
      }
    }

    const projectTotals = Array.from(ptMap.entries())
      .map(([projectId, d]) => ({
        projectId,
        projectName: d.projectName,
        activityMin: d.activityMin,
        meetingMin: d.meetingMin,
        totalMin: d.activityMin + d.meetingMin,
      }))
      .sort((a, b) => b.totalMin - a.totalMin);

    const totalMinutes = projectTotals.reduce((s, p) => s + p.totalMin, 0);
    const totalActivityMin = projectTotals.reduce((s, p) => s + p.activityMin, 0);
    const totalMeetingMin = projectTotals.reduce((s, p) => s + p.meetingMin, 0);

    return { dailyBreakdown, projectTotals, totalMinutes, totalActivityMin, totalMeetingMin };
  }, [weekEntries, weekAllocs]);

  // Insight text
  const weekDays = dailyBreakdown.length;
  const avgDailyMin = weekDays > 0 ? Math.round(totalMinutes / weekDays) : 0;
  const meetingPct = totalMinutes > 0 ? Math.round((totalMeetingMin / totalMinutes) * 100) : 0;
  const topProject = projectTotals[0];

  // ── Bar chart data: per-day stacked bars ──
  const projectColorMap = useMemo(() => {
    const map = new Map<string, string>();
    const allProjects = [...new Set([...entries.map((e) => e.projectId), ...allocations.map((a) => a.projectId)])];
    allProjects.forEach((id, i) => map.set(id, PROJECT_COLORS[i % PROJECT_COLORS.length]));
    return map;
  }, [entries, allocations]);

  const chartData = useMemo(() => {
    const days = DAY_LABELS.map((label, i) => {
      const d = addDays(selectedMonday, i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayBreakdown = dailyBreakdown.find((db) => db.date === dateStr);
      const segments = dayBreakdown
        ? dayBreakdown.projects.map((p) => ({
            projectId: p.projectId,
            projectName: p.projectName,
            minutes: p.totalMin,
            color: projectColorMap.get(p.projectId) ?? "#808080",
          }))
        : [];
      const total = segments.reduce((s, seg) => s + seg.minutes, 0);
      return { label, dateStr, segments, total };
    });
    return days;
  }, [selectedMonday, dailyBreakdown, projectColorMap]);

  const chartMax = Math.max(1, ...chartData.map((d) => d.total));

  // No data at all
  const hasAnyData = entries.length > 0 || allocations.length > 0;
  if (!hasAnyData) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
        <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">No data yet</p>
        <p className="mt-1 text-xs sm:text-sm text-[#808080]">
          Track time with the Activity Tracker or allocate meetings in the Meeting Tracker.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── Header + Week Nav ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base sm:text-lg font-bold">Weekly Insights</h2>
          <p className="mt-0.5 text-xs sm:text-sm text-[#808080]">
            Activity + Meetings combined
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            disabled={weekOffset <= -7}
            className="border border-[#808080]/30 px-2 py-1 text-xs text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors disabled:opacity-30"
          >
            ‹
          </button>
          <span className="text-xs sm:text-sm font-medium text-[#D9D9D9] min-w-[140px] text-center">
            {weekLabel}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={weekOffset >= 0}
            className="border border-[#808080]/30 px-2 py-1 text-xs text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>

      <div className="border-t border-[#F40000]/25" />

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="border-l-2 border-l-[#808080]/30 pl-3 sm:pl-4 py-1">
          <div className="text-xs uppercase tracking-wider text-[#808080]">Total</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold">{fmtMin(totalMinutes)}</div>
          <div className="text-xs text-[#808080]">{fmtHours(totalMinutes)}h</div>
        </div>
        <div className="border-l-2 border-l-[#F40000]/50 pl-3 sm:pl-4 py-1">
          <div className="text-xs uppercase tracking-wider text-[#808080]">Activity</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#F40000]">{fmtMin(totalActivityMin)}</div>
          <div className="text-xs text-[#808080]">{fmtHours(totalActivityMin)}h</div>
        </div>
        <div className="border-l-2 border-l-blue-400/50 pl-3 sm:pl-4 py-1">
          <div className="text-xs uppercase tracking-wider text-[#808080]">Meetings</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold text-blue-400">{fmtMin(totalMeetingMin)}</div>
          <div className="text-xs text-[#808080]">{fmtHours(totalMeetingMin)}h</div>
        </div>
        <div className="border-l-2 border-l-[#808080]/30 pl-3 sm:pl-4 py-1">
          <div className="text-xs uppercase tracking-wider text-[#808080]">Avg / day</div>
          <div className="mt-1.5 text-lg sm:text-xl font-bold">{fmtMin(avgDailyMin)}</div>
          <div className="text-xs text-[#808080]">{weekDays} active day{weekDays !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* ── AI Insight Box ── */}
      {totalMinutes > 0 && (
        <div className="border border-[#F40000]/30 bg-[#F40000]/5 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex items-start gap-2">
            <span className="text-sm">✨</span>
            <div className="text-xs sm:text-sm text-[#D9D9D9] space-y-0.5">
              <p>
                You tracked <span className="font-bold text-[#F8F8F8]">{fmtMin(totalMinutes)}</span> across{" "}
                <span className="font-bold text-[#F8F8F8]">{projectTotals.length}</span> project{projectTotals.length !== 1 ? "s" : ""}.
                {topProject && (
                  <> Top: <span className="font-bold text-[#F8F8F8]">{topProject.projectName}</span> ({fmtMin(topProject.totalMin)}).</>
                )}
                {meetingPct > 0 && <> Meetings: <span className="font-bold text-[#F8F8F8]">{meetingPct}%</span>.</>}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Stacked Bar Chart: By Project per Day ── */}
      <div className="space-y-2">
        <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">By Project</h3>
        <div className="pt-2">
          {/* Chart */}
          <div className="flex items-end gap-1.5 sm:gap-3" style={{ height: 180 }}>
            {chartData.map((day) => (
              <div key={day.label} className="flex-1 flex flex-col items-center gap-1">
                {/* Stacked bar */}
                <div className="w-full flex flex-col-reverse items-stretch" style={{ height: 140 }}>
                  {day.segments.map((seg, i) => {
                    const pct = chartMax > 0 ? (seg.minutes / chartMax) * 100 : 0;
                    return (
                      <div
                        key={seg.projectId}
                        className="w-full transition-all duration-300"
                        style={{
                          height: `${pct}%`,
                          backgroundColor: seg.color,
                          borderRadius: i === day.segments.length - 1 ? "4px 4px 0 0" : 0,
                          minHeight: pct > 0 ? 2 : 0,
                        }}
                        title={`${seg.projectName}: ${fmtMin(seg.minutes)}`}
                      />
                    );
                  })}
                </div>
                {/* Total label */}
                <span className="text-[10px] sm:text-xs text-[#808080] tabular-nums">
                  {day.total > 0 ? fmtMin(day.total) : ""}
                </span>
                {/* Day label */}
                <span className="text-[10px] sm:text-xs text-[#808080]">{day.label}</span>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-[#808080]/15 pt-3">
            {projectTotals.map((p) => (
              <div key={p.projectId} className="flex items-center gap-1.5">
                <div
                  className="h-2.5 w-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: projectColorMap.get(p.projectId) ?? "#808080" }}
                />
                <span className="text-xs text-[#D9D9D9]">{p.projectName}</span>
                <span className="text-xs font-bold text-[#F8F8F8]">{fmtMin(p.totalMin)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Daily Breakdown ── */}
      <div className="space-y-4">
        <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">Daily Breakdown</h3>

        {dailyBreakdown.length === 0 && (
          <div className="border border-dashed border-[#808080]/20 p-4 text-center text-xs text-[#808080]">
            No tracked time this week.
          </div>
        )}

        {dailyBreakdown.map((day) => {
          const dayTotal = day.projects.reduce((s, p) => s + p.totalMin, 0);
          return (
            <div key={day.date} className="border-b border-[#808080]/10 last:border-b-0">
              {/* Day header */}
              <div className="flex items-center justify-between py-2.5 sm:py-3">
                <span className="text-xs sm:text-sm font-bold text-[#D9D9D9]">
                  {format(new Date(day.date + "T12:00:00"), "EEEE, dd MMM")}
                </span>
                <span className="text-xs sm:text-sm font-bold text-[#F8F8F8]">{fmtMin(dayTotal)}</span>
              </div>

              {/* Project rows */}
              <div className="divide-y divide-[#808080]/10">
                {day.projects.map((p) => (
                  <div key={p.projectId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-1.5">
                    <span className="text-xs sm:text-sm text-[#D9D9D9] truncate">{p.projectName}</span>
                    <span className="text-xs sm:text-sm text-[#F40000] tabular-nums text-right w-14 sm:w-16">
                      {p.activityMin > 0 ? fmtMin(p.activityMin) : "—"}
                    </span>
                    <span className="text-xs sm:text-sm text-blue-400 tabular-nums text-right w-14 sm:w-16">
                      {p.meetingMin > 0 ? fmtMin(p.meetingMin) : "—"}
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-[#F8F8F8] tabular-nums text-right w-14 sm:w-16">
                      {fmtMin(p.totalMin)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Column labels footer */}
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-1.5 border-t border-[#808080]/10">
                <span />
                <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Activity</span>
                <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Meetings</span>
                <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Total</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
