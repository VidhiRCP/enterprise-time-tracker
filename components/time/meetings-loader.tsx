"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { format } from "date-fns";
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
  const [attemptedSessionRefresh, setAttemptedSessionRefresh] = useState(false);

  const fetchCalendar = useCallback(async (week?: string, { retryOnNoToken } = { retryOnNoToken: true }) => {
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

      // If server reports there's no token available, try a short session refresh and retry once
      if (!json.hasToken && retryOnNoToken && !attemptedSessionRefresh) {
        setAttemptedSessionRefresh(true);
        try {
          await fetch("/api/auth/session", { cache: "no-store" });
        } catch (e) {
          // ignore
        }
        setTimeout(() => fetchCalendar(week, { retryOnNoToken: false }), 600);
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setGroups([]);
      setHasToken(false);
    } finally {
      setLoading(false);
    }
  }, []);

  function formatWeekLabel(startIso: string) {
    const s = new Date(startIso + "T00:00:00");
    const e = new Date(s);
    e.setDate(s.getDate() + 6);
    const startFmt = format(s, "d MMM");
    const endFmt = format(e, "d MMM yyyy");
    return `${startFmt} – ${endFmt}`;
  }

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

  const weekLabel = formatWeekLabel(weekStart);

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrevWeek} className="px-3 py-1.5 border border-[#808080]/30">‹</button>
            <div className="px-4 py-1.5 border border-[#808080]/30">{weekLabel}</div>
            <button onClick={goNextWeek} className="px-3 py-1.5 border border-[#808080]/30">›</button>
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
        <div className="flex items-center justify-end mb-3">
          <div className="flex items-center gap-2">
            <button onClick={goPrevWeek} className="px-3 py-1.5 border border-[#808080]/30">‹</button>
            <div className="px-4 py-1.5 border border-[#808080]/30">{weekLabel}</div>
            <button onClick={goNextWeek} className="px-3 py-1.5 border border-[#808080]/30">›</button>
          </div>
        </div>
        <div className="border border-dashed border-[#808080]/30 p-6 text-center">
          <div className="text-xs sm:text-sm text-[#808080]">Failed to load calendar events: {error}</div>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              onClick={() => fetchCalendar(weekStart)}
              className="border border-[#808080]/30 px-3 py-1.5 text-xs sm:text-sm text-[#D9D9D9]"
            >
              Retry
            </button>
            <button
              onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
              className="border border-[#808080]/30 px-3 py-1.5 text-xs sm:text-sm text-[#D9D9D9]"
            >
              Reconnect calendar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // compute current week start ISO to disable next when at current week
  const currentWeekStart = startOfWeekISO(new Date());

  return (
    <div>
      <div className="flex items-center justify-end mb-3">
        <div className="flex items-center gap-3">
          <button onClick={goPrevWeek} className="border border-[#808080]/30 px-3 py-1.5 rounded" title="Previous week" aria-label="Previous week">‹</button>
          <div className="text-xs sm:text-sm font-medium text-[#D9D9D9] px-4 py-1 border border-[#808080]/10 rounded min-w-[180px] text-center">{weekLabel}</div>
          <button onClick={goNextWeek} disabled={weekStart >= currentWeekStart} className="border border-[#808080]/30 px-3 py-1.5 rounded disabled:opacity-30" title="Next week" aria-label="Next week">›</button>
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
