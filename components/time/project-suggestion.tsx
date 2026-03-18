"use client";

import type { ProjectSuggestionResult } from "@/lib/hooks/use-project-suggestion";

const CONFIDENCE_STYLES = {
  high: {
    border: "border-[#F40000]/40",
    bg: "bg-[#F40000]/8",
    badge: "bg-[#F40000]/20 text-[#F40000]",
    label: "High",
  },
  medium: {
    border: "border-[#D9D9D9]/30",
    bg: "bg-[#D9D9D9]/5",
    badge: "bg-[#D9D9D9]/15 text-[#D9D9D9]",
    label: "Medium",
  },
  low: {
    border: "border-[#808080]/30",
    bg: "bg-[#808080]/5",
    badge: "bg-[#808080]/15 text-[#808080]",
    label: "Low",
  },
} as const;

export function ProjectSuggestion({
  suggestion,
  onAccept,
  onDismiss,
}: {
  suggestion: ProjectSuggestionResult;
  onAccept: (projectId: string) => void;
  onDismiss: () => void;
}) {
  if (!suggestion) return null;

  const style = CONFIDENCE_STYLES[suggestion.confidence];

  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-3 py-2 border ${style.border} ${style.bg} text-xs sm:text-sm animate-in fade-in duration-200`}
    >
      <span className="text-[#808080]">💡 Suggested:</span>
      <span className="font-bold text-[#F8F8F8]">{suggestion.projectName}</span>
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${style.badge}`}>
        {style.label}
      </span>
      {suggestion.matchReason && (
        <span className="text-[#808080] text-[10px] hidden sm:inline">
          ({suggestion.matchReason})
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onAccept(suggestion.projectId)}
          className="border border-[#F40000]/40 px-2.5 py-0.5 text-xs font-bold text-[#F8F8F8] hover:bg-[#F40000]/20 transition-colors"
        >
          ✓ Apply
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="border border-[#808080]/30 px-2.5 py-0.5 text-xs text-[#808080] hover:text-[#D9D9D9] hover:border-[#D9D9D9]/30 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
