"use client";

import { useState, useTransition } from "react";

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

export function DashboardTabs({
  hasProjects,
  recoveredSession,
  activityContent,
  meetingsContent,
  insightsContent,
  aliasesContent,
  expensesContent,
}: {
  hasProjects: boolean;
  recoveredSession: boolean;
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
    <div>
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
  );
}
