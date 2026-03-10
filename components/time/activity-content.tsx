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

  function handleDateSelect(date: string) {
    setSelectedDate((prev) => (prev === date ? null : date));
  }

  return (
    <div className="space-y-3">
      {hasRecoveredSession && (
        <div className="rounded-xl border-l-2 border-l-[#F40000] border border-[#808080]/20 px-3 py-2 text-sm text-[#D9D9D9]">
          Recovered an unfinished timer session. Resume, pause, save, or discard it.
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
        {/* ── Left sidebar ── */}
        <div className="space-y-2 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto">
          <DashboardStats data={statsData} />
          <SidebarCalendar
            entryDates={entryDateStrings}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
          />
        </div>

        {/* ── Right main content ── */}
        <div className="space-y-3">
          <Card>
            <TimerPanel projects={projectOptions} activeSession={activeSession} />
          </Card>

          <Card>
            <div className="space-y-2">
              <div>
                <h2 className="text-base font-bold">Manual entry</h2>
                <p className="text-xs sm:text-sm text-[#808080]">Add time for work already completed.</p>
              </div>
              <ManualEntryForm projects={projectOptions} />
            </div>
          </Card>

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
