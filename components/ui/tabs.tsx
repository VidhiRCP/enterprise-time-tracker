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
      {children(active)}
    </div>
  );
}
