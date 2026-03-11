"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { DashboardStats, type DashboardStatsData } from "@/components/time/dashboard-stats";
import { SidebarCalendar } from "@/components/time/sidebar-calendar";
import { TimerPanel } from "@/components/time/timer-panel";
import { ManualEntryForm } from "@/components/time/manual-entry-form";
import { EntryTable } from "@/components/time/entry-table";

type ProjectOption = { projectId: string; projectName: string };

type SessionData = {
  id: string;
  projectId: string;
  notesDraft: string | null;
  accumulatedSeconds: number;
  status: "RUNNING" | "PAUSED";
  startedAt: string;
  lastResumedAt: string | null;
};

type Entry = {
  id: string;
  workDate: Date;
  durationMinutes: number;
  notes: string | null;
  source: string;
  status: string;
  project: { projectId: string; projectName: string };
  timerSession?: { startedAt: Date; stoppedAt: Date | null } | null;
};

/* ── Collapsible section wrapper ── */
function CollapsibleSection({
  title,
  subtitle,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div>
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-between text-left"
        >
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {subtitle && !collapsed && (
              <p className="text-xs sm:text-sm text-[#808080]">{subtitle}</p>
            )}
          </div>
          <span className="shrink-0 ml-2 text-[#808080] hover:text-[#D9D9D9] transition-colors text-sm">
            {collapsed ? "▸" : "▾"}
          </span>
        </button>
        {!collapsed && <div className="mt-3">{children}</div>}
      </div>
    </Card>
  );
}

export function ActivityContent({
  statsData,
  entryDateStrings,
  projectOptions,
  activeSession,
  entries,
  hasRecoveredSession,
}: {
  statsData: DashboardStatsData;
  entryDateStrings: string[];
  projectOptions: ProjectOption[];
  activeSession: SessionData | null;
  entries: Entry[];
  hasRecoveredSession: boolean;
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [statsCollapsed, setStatsCollapsed] = useState(false);
  const [timerCollapsed, setTimerCollapsed] = useState(false);
  const [manualCollapsed, setManualCollapsed] = useState(false);

  function handleDateSelect(date: string) {
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  function handleTodayClick() {
    const todayStr = new Date().toISOString().slice(0, 10);
    setSelectedDate((prev) => (prev === todayStr ? null : todayStr));
  }

  const showRecoveryBanner = hasRecoveredSession && activeSession?.status !== "RUNNING";

  return (
    <div className="space-y-3">
      {showRecoveryBanner && (
        <div className="rounded-xl border-l-2 border-l-[#F40000] border border-[#808080]/20 px-3 py-2 text-sm text-[#D9D9D9]">
          Recovered an unfinished timer session. Resume, pause, save, or discard it.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        {/* ── Left sidebar ── */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <div className="rounded-xl border border-[#808080]/30 p-3 hidden lg:block">
            <button
              onClick={() => setStatsCollapsed((v) => !v)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-xs uppercase tracking-wider text-[#808080] font-bold">Dashboard</span>
              <span className="text-[#808080] hover:text-[#D9D9D9] transition-colors text-sm">
                {statsCollapsed ? "▸" : "▾"}
              </span>
            </button>
            {!statsCollapsed && (
              <div className="mt-2">
                <DashboardStats data={statsData} onTodayClick={handleTodayClick} />
              </div>
            )}
          </div>
          {/* Mobile stats (always visible) */}
          <div className="lg:hidden">
            <DashboardStats data={statsData} onTodayClick={handleTodayClick} />
          </div>
          <SidebarCalendar
            entryDates={entryDateStrings}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
          />
        </div>

        {/* ── Right main content ── */}
        <div className="space-y-3">
          <CollapsibleSection
            title="Timer"
            collapsed={timerCollapsed}
            onToggle={() => setTimerCollapsed((v) => !v)}
          >
            <TimerPanel projects={projectOptions} activeSession={activeSession} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Manual entry"
            subtitle="Add time for work already completed."
            collapsed={manualCollapsed}
            onToggle={() => setManualCollapsed((v) => !v)}
          >
            <ManualEntryForm projects={projectOptions} />
          </CollapsibleSection>

          <Card>
            <div className="space-y-2">
              <div>
                <h2 className="text-base font-bold">Recent entries</h2>
                <p className="text-xs sm:text-sm text-[#808080]">Your entries, scoped to your project assignments.</p>
              </div>
              <EntryTable
                entries={entries}
                projects={projectOptions}
                calendarDate={selectedDate}
                onClearCalendarDate={() => setSelectedDate(null)}
              />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
