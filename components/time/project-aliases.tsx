"use client";

import { useState, useTransition } from "react";
import { updateProjectAliases } from "@/lib/actions";

type AliasEntry = {
  projectId: string;
  projectName: string;
  aliases: string;
};

export function ProjectAliases({ assignments }: { assignments: AliasEntry[] }) {
  const [entries, setEntries] = useState<AliasEntry[]>(assignments);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  function handleChange(projectId: string, value: string) {
    setEntries((prev) =>
      prev.map((e) => (e.projectId === projectId ? { ...e, aliases: value } : e)),
    );
    // Clear the saved indicator when editing
    setSaved((prev) => ({ ...prev, [projectId]: false }));
  }

  function handleSave(projectId: string) {
    const entry = entries.find((e) => e.projectId === projectId);
    if (!entry) return;

    startTransition(async () => {
      await updateProjectAliases({ projectId, aliases: entry.aliases });
      setSaved((prev) => ({ ...prev, [projectId]: true }));
      // Auto-clear the indicator after 2s
      setTimeout(() => {
        setSaved((prev) => ({ ...prev, [projectId]: false }));
      }, 2000);
    });
  }

  if (assignments.length === 0) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
        <p className="text-xs sm:text-sm text-[#808080]">
          No projects assigned. Ask your administrator to assign you to a project.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-bold">Project Aliases</h2>
        <p className="mt-1 text-xs sm:text-sm text-[#D9D9D9]">
          Add comma-separated keywords for each project. These are used to auto-suggest projects
          for your calendar meetings based on the meeting subject.
        </p>
      </div>

      <div className="space-y-4">
        {entries.map((entry) => (
          <div
            key={entry.projectId}
            className="border border-[#808080]/20 p-3 sm:p-4 space-y-2 hover:bg-[#F8F8F8]/5 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold">{entry.projectName}</span>
              {saved[entry.projectId] && (
                <span className="text-xs sm:text-sm text-green-400 font-medium animate-pulse">
                  ✓ Saved
                </span>
              )}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                value={entry.aliases}
                onChange={(e) => handleChange(entry.projectId, e.target.value)}
                placeholder="e.g. standup, sprint review, retro, project-x"
                className="flex-1 border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm placeholder:text-[#808080]/60 focus:border-[#F40000] focus:outline-none"
              />
              <button
                onClick={() => handleSave(entry.projectId)}
                disabled={isPending}
                className="bg-[#F40000] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#F40000]/80 disabled:opacity-40 transition-all shrink-0"
              >
                {isPending ? "Saving…" : "Save"}
              </button>
            </div>

            {entry.aliases && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {entry.aliases
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean)
                  .map((keyword, i) => (
                    <span
                      key={i}
                      className="inline-block rounded-full bg-[#808080]/20 px-2.5 py-0.5 text-xs text-[#D9D9D9]"
                    >
                      {keyword}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border border-[#808080]/10 p-3 sm:p-4">
        <p className="text-xs sm:text-sm text-[#808080]">
          <span className="font-bold text-[#D9D9D9]">💡 Tip:</span> Use short, distinctive
          keywords from meeting subjects. For example, if your project meetings often contain
          &quot;Sprint Review&quot; or &quot;PROJ-123&quot;, add those as aliases. The auto-suggest
          matches the longest keyword first.
        </p>
      </div>
    </div>
  );
}
