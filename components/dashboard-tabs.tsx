"use client";

import { useState, useTransition } from "react";
import { DashboardFilterProvider, useDashboardFilter } from "@/lib/dashboard-filter-context";

const TABS = [
  { key: "activity", label: "Activity Tracker" },
  { key: "meetings", label: "Meeting Tracker" },
  { key: "insights", label: "Insights" },
  { key: "aliases", label: "Project Aliases" },
  { key: "expenses", label: "Expense Tracker" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/* Skeleton pulse shown during tab transitions */
function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 w-48 bg-[#808080]/10 rounded" />
      <div className="h-4 w-72 bg-[#808080]/10 rounded" />
      <div className="h-32 bg-[#808080]/5 rounded border border-[#808080]/10" />
    </div>
  );
}

/* ── Filter bar — week picker + project filter ── */
function FilterBar({ projects }: { projects: { projectId: string; projectName: string }[] }) {
  const { weekLabel, goPrevWeek, goNextWeek, isCurrentWeek, projectFilter, setProjectFilter } = useDashboardFilter();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-[#808080]/10 bg-[#181818] px-4 py-3 rounded-md mb-4 sm:mb-5 md:mb-6">
      {/* Week picker */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-[#808080] hidden sm:inline">Week</span>
        <button onClick={goPrevWeek} className="btn btn-sm btn-ghost" title="Previous week" aria-label="Previous week">‹</button>
        <div className="text-xs sm:text-sm font-medium text-[#D9D9D9] px-4 py-1 border border-[#808080]/10 rounded min-w-[180px] text-center">
          {weekLabel}
        </div>
        <button onClick={goNextWeek} disabled={isCurrentWeek} className="btn btn-sm btn-ghost disabled:opacity-30" title="Next week" aria-label="Next week">›</button>
      </div>

      {/* Project filter */}
      {projects.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#808080] hidden sm:inline">Project</span>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="app-input bg-black text-sm min-w-[160px]"
          >
            <option value="ALL">All projects</option>
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

export function DashboardTabs({
  hasProjects,
  recoveredSession,
  projectOptions,
  activityContent,
  meetingsContent,
  insightsContent,
  aliasesContent,
  expensesContent,
}: {
  hasProjects: boolean;
  recoveredSession: boolean;
  projectOptions: { projectId: string; projectName: string }[];
  activityContent: React.ReactNode;
  meetingsContent: React.ReactNode;
  insightsContent: React.ReactNode;
  aliasesContent: React.ReactNode;
  expensesContent: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("activity");
  const [isPending, startTransition] = useTransition();

  function handleTabChange(key: TabKey) {
    startTransition(() => {
      setActive(key);
    });
  }

  return (
    <DashboardFilterProvider>
      <div>
        {/* Shared filter bar */}
        <FilterBar projects={projectOptions} />

        <nav className="flex gap-1 overflow-x-auto border-b border-[#808080]/20 mb-4 sm:mb-5 md:mb-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key as TabKey)}
                className={`btn btn-md whitespace-nowrap font-semibold px-4 py-2.5 sm:px-5 sm:py-3 transition-colors ${
                  active === tab.key
                    ? "text-[#F8F8F8] border-b-2 border-[#F40000] bg-[#181818]"
                    : "text-[#808080] hover:text-[#D9D9D9] border-b-2 border-transparent bg-transparent"
                }`}
              >
                {tab.label}
              </button>
            ))}
        </nav>

        {isPending ? (
          <TabSkeleton />
        ) : (
          <>
            {active === "activity" && activityContent}
            {active === "meetings" && meetingsContent}
            {active === "insights" && insightsContent}
            {active === "aliases" && aliasesContent}
            {active === "expenses" && expensesContent}
          </>
        )}
      </div>
    </DashboardFilterProvider>
  );
}
