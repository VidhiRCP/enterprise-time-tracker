"use client";

import { useEffect, useState, useCallback } from "react";
import { TimesheetPanel } from "./timesheet-panel";
import type { GroupedEvents } from "@/lib/calendar";

function startOfWeekISO(d: Date) {
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

function addDaysISO(isoDate: string, days: number) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function MeetingsLoader({
  projects,
}: {
  projects: { projectId: string; projectName: string }[];
}) {
  const [groups, setGroups] = useState<GroupedEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState<string>(() => startOfWeekISO(new Date()));

  const fetchCalendar = useCallback(async (week?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs = week ? `?weekStart=${encodeURIComponent(week)}` : "";
      const res = await fetch(`/api/calendar${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const txt = await res.text();
        setError(txt || `Status ${res.status}`);
        setGroups([]);
        setHasToken(false);
        return;
      }
      const json = await res.json();
      setGroups(json.groups ?? []);
      setHasToken(!!json.hasToken);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setGroups([]);
      setHasToken(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCalendar(weekStart);
  }, [fetchCalendar, weekStart]);

  function goPrevWeek() {
    setWeekStart((w) => addDaysISO(w, -7));
  }

  function goNextWeek() {
    setWeekStart((w) => addDaysISO(w, 7));
  }

  function onDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value; // yyyy-mm-dd
    // convert selected date to week start (monday)
    const d = new Date(val + "T00:00:00");
    setWeekStart(startOfWeekISO(d));
  }

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div />
          <div className="flex items-center gap-2">
            <button onClick={goPrevWeek} className="px-2 py-1 text-xs">◀</button>
            <input type="date" value={weekStart} onChange={onDateChange} className="bg-black border border-[#808080]/30 px-2 py-1 text-sm" />
            <button onClick={goNextWeek} className="px-2 py-1 text-xs">▶</button>
          </div>
        </div>
        <div className="border border-dashed border-[#808080]/30 p-6 text-center">
          <div className="text-xs sm:text-sm text-[#808080]">Loading calendar events…</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <div />
          <div className="flex items-center gap-2">
            <button onClick={goPrevWeek} className="px-2 py-1 text-xs">◀</button>
            <input type="date" value={weekStart} onChange={onDateChange} className="bg-black border border-[#808080]/30 px-2 py-1 text-sm" />
            <button onClick={goNextWeek} className="px-2 py-1 text-xs">▶</button>
          </div>
        </div>
        <div className="border border-dashed border-[#808080]/30 p-6 text-center">
          <div className="text-xs sm:text-sm text-[#808080]">Failed to load calendar events: {error}</div>
          <div className="mt-3">
            <button
              onClick={() => fetchCalendar(weekStart)}
              className="border border-[#808080]/30 px-3 py-1.5 text-xs sm:text-sm text-[#D9D9D9]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div />
        <div className="flex items-center gap-2">
          <button onClick={goPrevWeek} className="px-2 py-1 text-xs">◀</button>
          <input type="date" value={weekStart} onChange={onDateChange} className="bg-black border border-[#808080]/30 px-2 py-1 text-sm" />
          <button onClick={goNextWeek} className="px-2 py-1 text-xs">▶</button>
        </div>
      </div>
      <TimesheetPanel
        groups={groups}
        projects={projects}
        hasToken={hasToken}
        onRefresh={() => fetchCalendar(weekStart)}
      />
    </div>
  );
}

export default MeetingsLoader;
