"use client";

import { useState } from "react";

type Tab = {
  key: string;
  label: string;
};

export function Tabs({
  tabs,
  defaultTab,
  children,
}: {
  tabs: Tab[];
  defaultTab?: string;
  children: (activeTab: string) => React.ReactNode;
}) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key ?? "");

  return (
    <div>
      <nav className="flex gap-1 overflow-x-auto border-b border-[#808080]/20 mb-4 sm:mb-5 md:mb-6">
        {tabs.map((tab) => (
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
      {children(active)}
    </div>
  );
}
