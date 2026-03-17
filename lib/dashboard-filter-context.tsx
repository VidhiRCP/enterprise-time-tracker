"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { format, addDays } from "date-fns";

/* ── helpers ── */
/** Format a local Date as "YYYY-MM-DD" without UTC conversion */
function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Return ISO Monday string for the week containing `d` (local time) */
function startOfWeekISO(d: Date) {
  const dayOfWeek = d.getDay(); // 0=Sun … 6=Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return toLocalISO(monday);
}

/* ── Context shape ── */
type DashboardFilterValue = {
  weekStart: string;               // ISO Monday "YYYY-MM-DD"
  setWeekStart: (iso: string) => void;
  goPrevWeek: () => void;
  goNextWeek: () => void;
  isCurrentWeek: boolean;
  weekLabel: string;
  weekEnd: string;                 // ISO Sunday "YYYY-MM-DD"
  projectFilter: string;           // "ALL" or projectId
  setProjectFilter: (id: string) => void;
};

const DashboardFilterCtx = createContext<DashboardFilterValue | null>(null);

/* ── Hook ── */
export function useDashboardFilter() {
  const ctx = useContext(DashboardFilterCtx);
  if (!ctx) throw new Error("useDashboardFilter must be used within DashboardFilterProvider");
  return ctx;
}

/* ── Provider ── */
export function DashboardFilterProvider({ children }: { children: React.ReactNode }) {
  const [weekStart, setWeekStart] = useState<string>(() => startOfWeekISO(new Date()));
  const [projectFilter, setProjectFilter] = useState("ALL");

  const currentWeekStart = useMemo(() => startOfWeekISO(new Date()), []);

  function goPrevWeek() {
    setWeekStart((w) => {
      const d = new Date(w + "T00:00:00");
      d.setDate(d.getDate() - 7);
      return toLocalISO(d);
    });
  }

  function goNextWeek() {
    setWeekStart((w) => {
      const d = new Date(w + "T00:00:00");
      d.setDate(d.getDate() + 7);
      return toLocalISO(d);
    });
  }

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart + "T00:00:00");
    return toLocalISO(addDays(d, 6));
  }, [weekStart]);

  const weekLabel = useMemo(() => {
    const mon = new Date(weekStart + "T00:00:00");
    const sun = addDays(mon, 6);
    return `${format(mon, "d MMM")} – ${format(sun, "d MMM yyyy")}`;
  }, [weekStart]);

  const isCurrentWeek = weekStart >= currentWeekStart;

  const value = useMemo<DashboardFilterValue>(
    () => ({
      weekStart,
      setWeekStart,
      goPrevWeek,
      goNextWeek,
      isCurrentWeek,
      weekLabel,
      weekEnd,
      projectFilter,
      setProjectFilter,
    }),
    [weekStart, isCurrentWeek, weekLabel, weekEnd, projectFilter],
  );

  return (
    <DashboardFilterCtx.Provider value={value}>
      {children}
    </DashboardFilterCtx.Provider>
  );
}
