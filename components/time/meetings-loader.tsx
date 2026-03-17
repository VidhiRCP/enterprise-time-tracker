"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn } from "next-auth/react";
import { TimesheetPanel } from "./timesheet-panel";
import { useDashboardFilter } from "@/lib/dashboard-filter-context";
import type { GroupedEvents } from "@/lib/calendar";

export function MeetingsLoader({
  projects,
}: {
  projects: { projectId: string; projectName: string }[];
}) {
  const { weekStart } = useDashboardFilter();
  const [groups, setGroups] = useState<GroupedEvents[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
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

  // Re-fetch whenever shared weekStart changes
  useEffect(() => {
    fetchCalendar(weekStart);
  }, [fetchCalendar, weekStart]);

  if (loading) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-6 text-center">
        <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#808080]/30 border-t-[#F40000]" />
        <p className="mt-2 text-xs sm:text-sm text-[#808080]">Loading calendar events…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-6 text-center">
        <div className="text-xs sm:text-sm text-[#808080]">Failed to load calendar events: {error}</div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            onClick={() => fetchCalendar(weekStart)}
            className="btn btn-sm btn-ghost"
          >
            Retry
          </button>
          <button
            onClick={() => signIn(undefined, { callbackUrl: window.location.href })}
            className="btn btn-sm btn-primary"
          >
            Reconnect calendar
          </button>
        </div>
      </div>
    );
  }

  return (
    <TimesheetPanel
      groups={groups}
      projects={projects}
      hasToken={hasToken}
      onRefresh={() => fetchCalendar(weekStart)}
    />
  );
}

export default MeetingsLoader;
