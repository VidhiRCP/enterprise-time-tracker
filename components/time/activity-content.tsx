"use client";

import { useState } from "react";
import { DashboardStats, type DashboardStatsData } from "@/components/time/dashboard-stats";
import { SidebarCalendar } from "@/components/time/sidebar-calendar";
import { TimerPanel } from "@/components/time/timer-panel";
import { ManualEntryForm } from "@/components/time/manual-entry-form";
import { EntryTable } from "@/components/time/entry-table";
import { Card } from "@/components/ui/card";

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

/* ── Collapsible section wrapper — subtle card with red top accent ── */
function CollapsibleSection({
  title,
  subtitle,
  collapsed,
  onToggle,
  children,
  noBox = false,
}: {
  title: string;
  subtitle?: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  noBox?: boolean;
}) {
  return (
    <div className={`${noBox ? "p-0" : "border border-[#808080]/15 border-t-2 border-t-[#F40000]/40 p-4 sm:p-5"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="min-w-0">
          <h2 className="app-heading-3">{title}</h2>
          {subtitle && !collapsed && (
            <p className="text-xs sm:text-sm text-[#808080] mt-0.5">{subtitle}</p>
          )}
        </div>
        <span className="shrink-0 ml-2 text-[#808080] hover:text-[#D9D9D9] transition-colors text-sm">
          {collapsed ? "▸" : "▾"}
        </span>
      </button>
      {!collapsed && (
        <div className={`${noBox ? "mt-3 pt-3" : "mt-3 border-t border-[#808080]/10 pt-3"}`}>{children}</div>
      )}
    </div>
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
    <div className="space-y-10">
      {showRecoveryBanner && (
        <div className="border-l-2 border-l-[#F40000] border border-[#232323]/40 bg-[#181818] px-4 py-3 text-sm text-[#D9D9D9]">
          Recovered an unfinished timer session. Resume, pause, save, or discard it.
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[360px_1fr]">
        {/* ── Left sidebar ── */}
        <div className="space-y-10 lg:sticky lg:top-4 lg:self-start">
          {/* Desktop stats card */}
          <div className="hidden lg:block">
            <Card accent className="p-7">
              <button
                onClick={() => setStatsCollapsed((v) => !v)}
                className="w-full flex items-center justify-between text-left mb-2"
              >
                <h2 className="app-heading-3">Dashboard</h2>
                <span className="text-[#808080] hover:text-[#D9D9D9] transition-colors text-sm">
                  {statsCollapsed ? "▸" : "▾"}
                </span>
              </button>
              {!statsCollapsed && (
                <div className="mt-4">
                  <DashboardStats data={statsData} onTodayClick={handleTodayClick} />
                </div>
              )}
            </Card>
          </div>
          {/* Mobile stats (always visible) */}
          <div className="lg:hidden">
            <DashboardStats data={statsData} onTodayClick={handleTodayClick} />
          </div>
          {/* Calendar card */}
          <div className="hidden lg:block">
            <Card accent className="p-7">
              <SidebarCalendar
                entryDates={entryDateStrings}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
              />
            </Card>
          </div>
        </div>

        {/* ── Right main content ── */}
        <div className="space-y-10">
          <Card accent>
            <CollapsibleSection
              title="Timer"
              collapsed={timerCollapsed}
              onToggle={() => setTimerCollapsed((v) => !v)}
              noBox
            >
              <div className="px-0">{/* keep padding consistent when noBox is used */}
                <TimerPanel projects={projectOptions} activeSession={activeSession} />
              </div>
            </CollapsibleSection>
          </Card>

          <Card accent>
            <CollapsibleSection
              title="Manual Entry"
              subtitle="Add time for work already completed."
              collapsed={manualCollapsed}
              onToggle={() => setManualCollapsed((v) => !v)}
              noBox
            >
              <div className="px-0">
                <ManualEntryForm projects={projectOptions} />
              </div>
            </CollapsibleSection>
          </Card>

          <Card accent>
            <div className="space-y-4">
              <div>
                <h2 className="app-heading-2 mb-2">Recent Entries</h2>
                <p className="text-xs sm:text-sm text-[#808080] mb-3">Your entries, scoped to your project assignments.</p>
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
