"use client";

import React, { useState, useMemo, useEffect } from "react";
import { format, addDays } from "date-fns";
import { Card } from "@/components/ui/card";
import { useDashboardFilter } from "@/lib/dashboard-filter-context";

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

/* ── Error Boundary (defined outside component to avoid re-creation each render) ── */
class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
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
    } catch (_) {}
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

/* ── Main Component ── */
export function InsightsPanel({ data }: { data?: InsightsData }) {
  const { entries: initialEntries = [], allocations: initialAllocs = [] } = data ?? {} as InsightsData;
  const { weekStart, weekEnd, projectFilter } = useDashboardFilter();

  const [entries, setEntries] = useState(initialEntries);
  const [allocations, setAllocations] = useState(initialAllocs);
  const [loading, setLoading] = useState(false);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [narrativeLoading, setNarrativeLoading] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Compute selected week boundaries from context
  const selectedMonday = useMemo(() => new Date(weekStart + "T00:00:00"), [weekStart]);
  const selectedSunday = useMemo(() => addDays(selectedMonday, 6), [selectedMonday]);

  // Filter data for selected week + project
  const weekEntries = useMemo(
    () => entries.filter((e) => {
      if (e.workDate < weekStart || e.workDate > weekEnd) return false;
      if (projectFilter !== "ALL" && e.projectId !== projectFilter) return false;
      return true;
    }),
    [entries, weekStart, weekEnd, projectFilter],
  );

  const weekAllocs = useMemo(
    () => allocations.filter((a) => {
      if (a.eventDate < weekStart || a.eventDate > weekEnd) return false;
      if (projectFilter !== "ALL" && a.projectId !== projectFilter) return false;
      return true;
    }),
    [allocations, weekStart, weekEnd, projectFilter],
  );

  // Fetch week-specific data from server when shared weekStart changes
  useEffect(() => {
    let cancelled = false;
    const fetchWeek = async () => {
      setLoading(true);
      try {
        const resp = await fetch("/api/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weekStart: new Date(weekStart + "T00:00:00").toISOString() }),
        });
        if (!resp.ok) throw new Error("Failed to fetch week data");
        const json = await resp.json();
        if (cancelled) return;
        setEntries(json.entries ?? []);
        setAllocations(json.allocations ?? []);
        // Fetch narrative in parallel
        setNarrativeLoading(true);
        try {
          const nresp = await fetch('/api/insights/narrative', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStart: new Date(weekStart + 'T00:00:00').toISOString() }) });
          if (nresp.ok) {
            const nj = await nresp.json();
            if (!cancelled) setNarrative(nj.narrative ?? null);
          } else {
            if (!cancelled) setNarrative(null);
          }
        } catch (e) {
          if (!cancelled) setNarrative(null);
        } finally {
          if (!cancelled) setNarrativeLoading(false);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchWeek();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

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

  // Build project grouped view (must be before early return to respect Rules of Hooks)
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

  // No data at all
  const hasAnyData = entries.length > 0 || allocations.length > 0;
  if (!hasAnyData) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-6 text-center rounded-lg">
        <div className="mb-2">
          <svg width="48" height="48" fill="none" viewBox="0 0 48 48" className="mx-auto mb-2"><rect x="8" y="8" width="32" height="32" rx="6" fill="#232323" /><path d="M16 32V24M24 32V16M32 32V28" stroke="#808080" strokeWidth="2" strokeLinecap="round" /></svg>
        </div>
        <p className="text-sm font-bold text-[#D9D9D9]">No data for this week</p>
        <p className="mt-1 text-xs sm:text-sm text-[#808080]">
          Track time with the Activity Tracker or allocate meetings in the Meeting Tracker.
        </p>
      </div>
    );
  }

  // Error boundary fallback UI
  const errorFallback = (
    <div className="border border-dashed border-[#808080]/30 p-6 text-center rounded-lg">
      <p className="text-sm font-bold text-[#D9D9D9]">Something went wrong</p>
      <p className="mt-1 text-xs sm:text-sm text-[#808080]">Please try changing the week or refreshing the page.</p>
    </div>
  );

  return (
    <PanelErrorBoundary fallback={errorFallback}>
      <div className="space-y-8">
      {loading && (
        <div className="border border-dashed border-[#808080]/30 p-6 text-center">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#808080]/30 border-t-[#F40000]" />
          <p className="mt-2 text-xs sm:text-sm text-[#808080]">Loading Insights…</p>
        </div>
      )}
      {!loading && (
      <>
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
              <div className="text-xs sm:text-sm text-[#D9D9D9] space-y-1 w-full">
                {/* fallback short summary based on metrics */}
                <p>
                  You tracked <span className="font-bold text-[#F8F8F8]">{fmtMin(totalMinutes)}</span> across <span className="font-bold text-[#F8F8F8]">{projectTotals.length}</span> project{projectTotals.length !== 1 ? "s" : ""}.
                  {topProject && (
                    <> Top: <span className="font-bold text-[#F8F8F8]">{topProject.projectName}</span> ({fmtMin(topProject.totalMin)}).</>
                  )}
                </p>

                {/* Narrative from AI */}
                <div>
                  {narrativeLoading ? (
                    <div className="text-xs text-[#808080] flex items-center gap-2">
                      <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#808080]/30 border-t-[#F40000]" />
                      Loading weekly summary…
                    </div>
                  ) : narrative ? (
                    <p className="text-sm text-[#D9D9D9]">{narrative}</p>
                  ) : (
                    <p className="text-xs text-[#808080]">No narrative available for this week.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
      <Card accent className="p-7">
        <h3 className="app-heading-3 text-[#D9D9D9] mb-4">By Project</h3>
        <div className="pt-3">
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
        {dailyBreakdown.length === 0 ? (
          <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-xs sm:text-sm text-[#808080]">
            No tracked time this week.
          </div>
        ) : (
          <>
            {/* ── Mobile: stacked cards ── */}
            <div className="space-y-3 md:hidden">
              {dailyBreakdown.map((day) => {
                const dayTotal = day.projects.reduce((s, p) => s + p.totalMin, 0);
                return (
                  <div key={day.date} className="border border-[#808080]/30 p-3 sm:p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-bold">
                        {format(new Date(day.date + "T12:00:00"), "EEEE, dd MMM")}
                      </div>
                      <span className="text-sm font-bold text-[#F8F8F8]">{fmtMin(dayTotal)}</span>
                    </div>
                    {day.projects.map((p) => (
                      <div key={p.projectId} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#D9D9D9] items-center">
                        <span className="font-bold text-[#F8F8F8]">{p.projectName}</span>
                        <span className="text-[#F40000]">{p.activityMin > 0 ? fmtMin(p.activityMin) : "—"}</span>
                        <span className="text-blue-400">{p.meetingMin > 0 ? fmtMin(p.meetingMin) : "—"}</span>
                        <span className="font-bold">{fmtMin(p.totalMin)}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* ── Desktop: full table ── */}
            <div className="hidden md:block overflow-x-auto border border-[#808080]/10">
              <table className="min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-black">
                  <tr>
                    <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Day</th>
                    <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Project</th>
                    <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-bold uppercase tracking-wider text-[#F40000]">Activity</th>
                    <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-bold uppercase tracking-wider text-blue-400">Meetings</th>
                    <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-right text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyBreakdown.map((day) => {
                    const dayTotal = day.projects.reduce((s, p) => s + p.totalMin, 0);
                    return (
                      <React.Fragment key={day.date}>
                        {day.projects.map((p, pi) => (
                          <tr key={p.projectId} className="hover:bg-[#F8F8F8]/5 even:bg-[#F8F8F8]/[0.02] transition-colors">
                            {pi === 0 ? (
                              <td rowSpan={day.projects.length} className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9] whitespace-nowrap align-top font-bold">
                                {format(new Date(day.date + "T12:00:00"), "EEE, dd MMM")}
                              </td>
                            ) : null}
                            <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3">
                              <span className="font-bold">{p.projectName}</span>
                            </td>
                            <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-right text-[#F40000] tabular-nums">
                              {p.activityMin > 0 ? fmtMin(p.activityMin) : <span className="text-[#808080]">—</span>}
                            </td>
                            <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-right text-blue-400 tabular-nums">
                              {p.meetingMin > 0 ? fmtMin(p.meetingMin) : <span className="text-[#808080]">—</span>}
                            </td>
                            <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-right font-bold tabular-nums">
                              {fmtMin(p.totalMin)}
                            </td>
                          </tr>
                        ))}
                        {/* Day total row */}
                        <tr className="bg-[#F8F8F8]/[0.03]">
                          <td className="border-b border-[#808080]/20 px-3 lg:px-4 py-1.5 lg:py-2" />
                          <td className="border-b border-[#808080]/20 px-3 lg:px-4 py-1.5 lg:py-2 text-right text-xs font-bold text-[#808080] uppercase tracking-wider">Day total</td>
                          <td className="border-b border-[#808080]/20 px-3 lg:px-4 py-1.5 lg:py-2 text-right text-[#F40000] font-bold tabular-nums">
                            {fmtMin(day.projects.reduce((s, p) => s + p.activityMin, 0))}
                          </td>
                          <td className="border-b border-[#808080]/20 px-3 lg:px-4 py-1.5 lg:py-2 text-right text-blue-400 font-bold tabular-nums">
                            {fmtMin(day.projects.reduce((s, p) => s + p.meetingMin, 0))}
                          </td>
                          <td className="border-b border-[#808080]/20 px-3 lg:px-4 py-1.5 lg:py-2 text-right font-bold tabular-nums text-[#F8F8F8]">
                            {fmtMin(dayTotal)}
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      </>
      )}
    </div>
    </PanelErrorBoundary>
  );
}
