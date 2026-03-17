"use client";

import React, { useState, useMemo, useEffect } from "react";
import { format, addDays } from "date-fns";
import { Card } from "@/components/ui/card";

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
export function InsightsPanel({ data }: { data?: InsightsData }) {
  const { entries: initialEntries = [], allocations: initialAllocs = [], currentWeekISO } = data ?? {} as InsightsData;
  const currentMonday = currentWeekISO ? new Date(currentWeekISO) : new Date();

  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState<'day' | 'project'>('day');
  const [entries, setEntries] = useState(initialEntries);
  const [allocations, setAllocations] = useState(initialAllocs);
  const [loading, setLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Reset to current week whenever server-provided current week changes
  useEffect(() => {
    setWeekOffset(0);
  }, [currentWeekISO]);

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

  // Fetch week-specific data from server when weekOffset changes
  useEffect(() => {
    let cancelled = false;
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const target = new Date(currentMonday);
        target.setDate(target.getDate() + weekOffset * 7);
        const resp = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart: target.toISOString() }),
        });
        if (!resp.ok) throw new Error("Failed to fetch week data");
        const json = await resp.json();
        if (cancelled) return;
        setEntries(json.entries ?? []);
        setAllocations(json.allocations ?? []);
      } catch (err) {
        // keep client-side data if network fails
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeek();
    return () => {
      cancelled = true;
    };
  }, [weekOffset, currentWeekISO]);

  // Export helper (CSV or XLSX)
  async function exportWeek(fmt: 'csv' | 'xlsx') {
    try {
      // Build matrix: projects x days for the selected week
      const days = DAY_LABELS.map((_, i) => {
        const d = addDays(selectedMonday, i);
        return d.toISOString().slice(0, 10);
      });

      const projMap = new Map<string, { projectName: string; byDay: Record<string, number> }>();
      for (const day of dailyBreakdown) {
        for (const p of day.projects) {
          const cur = projMap.get(p.projectId) ?? { projectName: p.projectName, byDay: {} };
          cur.byDay[day.date] = (cur.byDay[day.date] ?? 0) + p.totalMin;
          projMap.set(p.projectId, cur);
        }
      }

      const headers = ['Project ID', 'Project Name', ...days.map((d) => format(new Date(d + 'T12:00:00'), 'd/M/yy'))];
      const rows: string[][] = [];
      for (const [projectId, v] of projMap.entries()) {
        const row = [projectId, v.projectName, ...days.map((d) => {
          const mins = v.byDay[d] ?? 0;
          const hours = mins / 60;
          return hours ? hours.toFixed(2) : '0.00';
        })];
        rows.push(row);
      }

      const esc = (s: any) => {
        if (s === null || s === undefined) return '';
        const str = String(s);
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      };

      if (fmt === 'xlsx') {
        try {
          const ExcelJS = (await import('exceljs')) as any;
          const workbook = new ExcelJS.Workbook();
          const ws = workbook.addWorksheet('Daily Breakdown');
          ws.addRow(headers);
          for (const r of rows) ws.addRow(r);
          const ab: ArrayBuffer = await workbook.xlsx.writeBuffer();
          const buffer = Buffer.from(ab);
          const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `daily-breakdown-${selectedMonday.toISOString().slice(0, 10)}.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error('Excel export failed', err);
        }
      } else {
        const csv = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daily-breakdown-${selectedMonday.toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error(err);
    }
  }

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

  // Local Error Boundary to prevent a client-side exception from crashing the whole app
  class PanelErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
    constructor(props: any) {
      super(props);
      this.state = { hasError: false };
    }
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    componentDidCatch(err: any) {
      console.error('InsightsPanel caught error:', err);
      try {
        fetch('/api/dev/logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: String(err), stack: err?.stack ?? null, time: new Date().toISOString() }),
        }).catch(() => {});
      } catch (_) {
        // ignore
      }
    }
    render() {
      if (this.state.hasError) {
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-end gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWeekOffset((o) => o - 1)}
                  className="border border-[#808080]/30 px-3 py-1 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors rounded"
                  title="Previous week"
                  aria-label="Previous week"
                >
                  ‹
                </button>
                <div className="text-xs sm:text-sm font-medium text-[#D9D9D9] px-4 py-1 border border-[#808080]/10 rounded min-w-[180px] text-center">
                  {weekLabel}
                </div>
                <button
                  onClick={() => setWeekOffset((o) => o + 1)}
                  disabled={weekOffset >= 0}
                  className="border border-[#808080]/30 px-3 py-1 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors rounded disabled:opacity-30"
                  title="Next week"
                  aria-label="Next week"
                >
                  ›
                </button>
              </div>

              <div className="flex items-center gap-2 border border-[#808080]/10 rounded overflow-hidden">
                <button onClick={() => setViewMode('day')} className={`btn btn-sm ${viewMode === 'day' ? 'btn-primary' : 'btn-ghost'}`}>By Day</button>
                <button onClick={() => setViewMode('project')} className={`btn btn-sm ${viewMode === 'project' ? 'btn-primary' : 'btn-ghost'}`}>By Project</button>
              </div>
            </div>

            <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
              <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">No data yet</p>
              <p className="mt-1 text-xs sm:text-sm text-[#808080]">
                Track time with the Activity Tracker or allocate meetings in the Meeting Tracker.
              </p>
            </div>
          </div>
        );
      }
      return this.props.children as any;
    }
  }

  // No data at all
  const hasAnyData = entries.length > 0 || allocations.length > 0;
  if (!hasAnyData) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-end gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="btn btn-sm btn-ghost"
              title="Previous week"
              aria-label="Previous week"
            >
              ‹
            </button>
            <div className="text-xs sm:text-sm font-medium text-[#D9D9D9] px-4 py-1 border border-[#808080]/10 rounded min-w-[180px] text-center">
              {weekLabel}
            </div>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              disabled={weekOffset >= 0}
              className="btn btn-sm btn-ghost disabled:opacity-30"
              title="Next week"
              aria-label="Next week"
            >
              ›
            </button>
          </div>
          <div className="flex items-center gap-2 border border-[#808080]/10 rounded overflow-hidden">
            <button onClick={() => setViewMode('day')} className={`btn btn-sm ${viewMode === 'day' ? 'btn-primary' : 'btn-ghost'}`}>By Day</button>
            <button onClick={() => setViewMode('project')} className={`btn btn-sm ${viewMode === 'project' ? 'btn-primary' : 'btn-ghost'}`}>By Project</button>
          </div>
        </div>
        <div className="border border-dashed border-[#808080]/30 p-6 text-center rounded-lg">
          <div className="mb-2">
            <svg width="48" height="48" fill="none" viewBox="0 0 48 48" className="mx-auto mb-2"><rect x="8" y="8" width="32" height="32" rx="6" fill="#232323" /><path d="M16 32V24M24 32V16M32 32V28" stroke="#808080" strokeWidth="2" strokeLinecap="round" /></svg>
          </div>
          <p className="text-sm font-bold text-[#D9D9D9]">No data for this week</p>
          <p className="mt-1 text-xs sm:text-sm text-[#808080]">
            Track time with the Activity Tracker or allocate meetings in the Meeting Tracker.
          </p>
        </div>
      </div>
    );
  }

  // Build project grouped view
  const projectsGrouped = useMemo(() => {
    const map = new Map<string, { projectName: string; days: { date: string; minutes: number }[]; totalMin: number }>();
    for (const day of dailyBreakdown) {
      for (const p of day.projects) {
        const cur = map.get(p.projectId) ?? { projectName: p.projectName, days: [], totalMin: 0 };
        cur.days.push({ date: day.date, minutes: p.totalMin });
        cur.totalMin += p.totalMin;
        map.set(p.projectId, cur);
      }
    }
    return Array.from(map.entries()).map(([projectId, v]) => ({ projectId, projectName: v.projectName, days: v.days, totalMin: v.totalMin })).sort((a, b) => b.totalMin - a.totalMin);
  }, [dailyBreakdown]);

  return (
    <PanelErrorBoundary>
      <div className="space-y-8">
      {/* Week nav moved outside the card to improve layout */}
      <div className="flex items-center justify-end gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="border border-[#808080]/30 px-3 py-1 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors rounded"
            title="Previous week"
            aria-label="Previous week"
          >
            ‹
          </button>
          <div className="text-xs sm:text-sm font-medium text-[#D9D9D9] px-4 py-1 border border-[#808080]/10 rounded min-w-[180px] text-center">
            {weekLabel}
          </div>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            disabled={weekOffset >= 0}
            className="border border-[#808080]/30 px-3 py-1 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors rounded disabled:opacity-30"
            title="Next week"
            aria-label="Next week"
          >
            ›
          </button>
        </div>

        <div className="flex items-center gap-2 border border-[#808080]/10 rounded overflow-hidden">
          <button onClick={() => setViewMode('day')} className={`btn btn-sm ${viewMode === 'day' ? 'btn-primary' : 'btn-ghost'}`}>By Day</button>
          <button onClick={() => setViewMode('project')} className={`btn btn-sm ${viewMode === 'project' ? 'btn-primary' : 'btn-ghost'}`}>By Project</button>
        </div>
      </div>
      <Card accent className="p-7">
        <div className="mb-6">
          <div>
            <h2 className="app-heading-2">Weekly Insights</h2>
            <p className="mt-1 text-xs sm:text-sm text-[#808080]">Activity + Meetings combined</p>
          </div>
        </div>
        <div className="border-t border-[#F40000]/25 mb-7" />
        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8 mb-7">
          <div className="border-l-2 border-l-[#808080]/30 pl-3 sm:pl-4 py-1">
            <div className="text-sm sm:text-base font-bold">Total</div>
            <div className="mt-1.5 text-lg sm:text-xl font-bold">{fmtMin(totalMinutes)}</div>
            <div className="text-xs text-[#808080]">{fmtHours(totalMinutes)}h</div>
          </div>
          <div className="border-l-2 border-l-[#F40000]/50 pl-3 sm:pl-4 py-1">
            <div className="text-sm sm:text-base font-bold">Activity</div>
            <div className="mt-1.5 text-lg sm:text-xl font-bold text-[#F40000]">{fmtMin(totalActivityMin)}</div>
            <div className="text-xs text-[#808080]">{fmtHours(totalActivityMin)}h</div>
          </div>
          <div className="border-l-2 border-l-blue-400/50 pl-3 sm:pl-4 py-1">
            <div className="text-sm sm:text-base font-bold">Meetings</div>
            <div className="mt-1.5 text-lg sm:text-xl font-bold text-blue-400">{fmtMin(totalMeetingMin)}</div>
            <div className="text-xs text-[#808080]">{fmtHours(totalMeetingMin)}h</div>
          </div>
          <div className="border-l-2 border-l-[#808080]/30 pl-3 sm:pl-4 py-1">
            <div className="text-sm sm:text-base font-bold">Avg / day</div>
            <div className="mt-1.5 text-lg sm:text-xl font-bold">{fmtMin(avgDailyMin)}</div>
            <div className="text-xs text-[#808080]">{weekDays} active day{weekDays !== 1 ? "s" : ""}</div>
          </div>
        </div>
        {/* AI Insight Box */}
        {totalMinutes > 0 && (
          <div className="brand-border brand-soft px-5 py-4 sm:px-6 sm:py-5 mt-4" style={{ borderStyle: 'solid', borderWidth: 1 }}>
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
      </Card>
      <Card accent className="p-7">
        <h3 className="app-heading-3 text-[#D9D9D9] mb-4">By Project</h3>
        <div className="pt-3">
          {/* Chart */}
          {viewMode === 'day' ? (
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
          ) : (
            <div className="space-y-3">
              {projectsGrouped.map((p) => (
                <div key={p.projectId} className="border border-[#808080]/20 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold">{p.projectName}</div>
                      <div className="text-xs text-[#808080]">{fmtMin(p.totalMin)}</div>
                    </div>
                    <div className="text-xs text-[#808080]">{p.days.length} day{p.days.length !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {p.days.map((d) => (
                      <div key={d.date} className="flex items-center justify-between text-xs">
                        <div className="text-[#D9D9D9]">{format(new Date(d.date + 'T12:00:00'), 'dd MMM')}</div>
                        <div className="text-[#808080]">{fmtMin(d.minutes)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
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
      </Card>
      <Card accent className="p-7">
        <div className="flex items-center justify-between mb-4">
          <h3 className="app-heading-3 text-[#D9D9D9]">Daily Breakdown</h3>
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen((s) => !s)}
              className="border border-[#808080]/30 px-3 py-2 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors"
              title="Export daily breakdown for this week"
            >
              Export ▾
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-black border border-[#808080]/20 p-2 z-20">
                <button
                  className="w-full text-left px-2 py-2 text-sm hover:bg-[#111]"
                  onClick={async () => {
                    setExportMenuOpen(false);
                    await exportWeek('csv');
                  }}
                >
                  Export CSV
                </button>
                <button
                  className="w-full text-left px-2 py-2 text-sm hover:bg-[#111]"
                  onClick={async () => {
                    setExportMenuOpen(false);
                    await exportWeek('xlsx');
                  }}
                >
                  Export Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
        </div>
        {dailyBreakdown.length === 0 && (
          <div className="border border-dashed border-[#808080]/20 p-4 text-center text-xs text-[#808080]">
            No tracked time this week.
          </div>
        )}
        {/* Column labels header (sticky) */}
        {dailyBreakdown.length > 0 && (
          <div className="sticky top-0 z-10 bg-black border-b border-[#808080]/10">
            <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] items-center gap-x-4 py-2 px-0">
              <span />
              <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Activity</span>
              <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Meetings</span>
              <span className="text-[10px] uppercase tracking-wider text-[#808080] text-right w-14 sm:w-16">Total</span>
            </div>
            <div className="md:hidden px-2 py-1 text-xs text-[#808080]">Activity · Meetings · Total</div>
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
              {/* removed per-day footer labels (now shown once at top) */}
            </div>
          );
        })}
      </Card>
    </div>
    </PanelErrorBoundary>
  );
}
