"use client";

import { useState } from "react";

const TABS = [
  { key: "activity", label: "Activity Tracker" },
  { key: "meetings", label: "Meeting Tracker" },
  { key: "insights", label: "Insights" },
  { key: "aliases", label: "Project Aliases" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function DashboardTabs({
  hasProjects,
  recoveredSession,
  activityContent,
  meetingsContent,
  insightsContent,
  aliasesContent,
}: {
  hasProjects: boolean;
  recoveredSession: boolean;
  activityContent: React.ReactNode;
  meetingsContent: React.ReactNode;
  insightsContent: React.ReactNode;
  aliasesContent: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("activity");

  return (
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-[#808080]/20 mb-4 sm:mb-5 md:mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`
              whitespace-nowrap px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium transition-colors
              ${
                active === tab.key
                  ? "text-[#F8F8F8] border-b-2 border-[#F40000]"
                  : "text-[#808080] hover:text-[#D9D9D9] border-b-2 border-transparent"
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {active === "activity" && activityContent}
      {active === "meetings" && meetingsContent}
      {active === "insights" && insightsContent}
      {active === "aliases" && aliasesContent}
    </div>
  );
}
