"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { format, addDays } from "date-fns";

/* ── Week helpers ── */
function startOfWeekISO(d: Date) {
  const dayOfWeek = d.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
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
      return d.toISOString().slice(0, 10);
    });
  }

  function goNextWeek() {
    setWeekStart((w) => {
      const d = new Date(w + "T00:00:00");
      d.setDate(d.getDate() + 7);
      return d.toISOString().slice(0, 10);
    });
  }

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart + "T00:00:00");
    return addDays(d, 6).toISOString().slice(0, 10);
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
