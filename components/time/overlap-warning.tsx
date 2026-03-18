"use client";

import { useEffect, useState, useCallback } from "react";

/* ── Types (mirror server types) ── */
type OverlapSuggestion = {
  type: "keep_both" | "shorten_timer" | "split_time" | "ignore";
  label: string;
  reason: string;
  suggestedNewEndTime?: string;
  suggestedMeetingEntryMinutes?: number;
};

type OverlapItem = {
  timerSessionId: string | null;
  meetingId: string;
  overlapMinutes: number;
  timeRangeStart: string;
  timeRangeEnd: string;
  meetingStart: string;
  meetingEnd: string;
  projectId: string;
  projectName: string;
  meetingTitle: string;
  meetingProjectId: string | null;
  meetingProjectName: string | null;
  suggestions: OverlapSuggestion[];
};

type OverlapResult = {
  overlaps: OverlapItem[];
  totalOverlapMinutes: number;
  affectedDays: number;
};

/* ── Helpers ── */
function fmtMin(m: number) {
  if (m === 0) return "0m";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h === 0) return `${rem}m`;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ── Component ── */
export function OverlapWarning() {
  const [data, setData] = useState<OverlapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchOverlaps = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch("/api/overlaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (resp.ok) {
        const json = await resp.json();
        setData(json);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverlaps();
    // Re-check every 5 minutes
    const id = setInterval(fetchOverlaps, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchOverlaps]);

  // Filter out dismissed
  const visibleOverlaps = data?.overlaps.filter((o) => !dismissed.has(o.meetingId)) ?? [];

  if (loading || visibleOverlaps.length === 0) return null;

  const totalMins = visibleOverlaps.reduce((s, o) => s + o.overlapMinutes, 0);
  const isActive = visibleOverlaps.some((o) => {
    const end = new Date(o.timeRangeEnd);
    return end.getTime() > Date.now();
  });

  return (
    <div className="border-l-2 border-l-[#F59E0B] border border-[#F59E0B]/20 bg-[#181818] px-4 py-3 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="text-base mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-bold text-[#F8F8F8]">
              {isActive ? "Active overlap detected" : "Overlapping time detected today"}
            </p>
            <p className="text-xs text-[#D9D9D9] mt-0.5">
              {visibleOverlaps.length === 1
                ? `You have ${fmtMin(totalMins)} of overlapping time between a timer session and a meeting.`
                : `${visibleOverlaps.length} overlaps totalling ${fmtMin(totalMins)} of double-booked time today.`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(new Set(visibleOverlaps.map((o) => o.meetingId)))}
          className="text-xs text-[#808080] hover:text-[#D9D9D9] transition-colors shrink-0"
          title="Dismiss all"
        >
          ✕
        </button>
      </div>

      {/* Overlap items */}
      {visibleOverlaps.map((o) => {
        const isExpanded = expandedId === o.meetingId;
        return (
          <div key={o.meetingId} className="border border-[#808080]/15 bg-black/30 p-3 space-y-2">
            <button
              onClick={() => setExpandedId(isExpanded ? null : o.meetingId)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="min-w-0 text-xs sm:text-sm text-[#D9D9D9]">
                <span className="font-bold text-[#F8F8F8]">{o.projectName}</span>
                {" "}timer overlaps{" "}
                <span className="font-bold text-blue-400">&quot;{o.meetingTitle}&quot;</span>
                {o.meetingProjectName && (
                  <span className="text-[#808080]"> ({o.meetingProjectName})</span>
                )}
                <span className="text-[#F59E0B] ml-1.5 font-bold">{fmtMin(o.overlapMinutes)}</span>
              </div>
              <span className="shrink-0 ml-2 text-[#808080] text-xs">{isExpanded ? "▾" : "▸"}</span>
            </button>

            {/* Time details */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#808080]">
              <span>Timer: {fmtTime(o.timeRangeStart)}–{fmtTime(o.timeRangeEnd)}</span>
              <span>Meeting: {fmtTime(o.meetingStart)}–{fmtTime(o.meetingEnd)}</span>
            </div>

            {/* Expanded: suggestions */}
            {isExpanded && (
              <div className="border-t border-[#808080]/10 pt-2 space-y-1.5">
                <p className="text-xs font-bold text-[#808080] uppercase tracking-wider">Suggested actions</p>
                {o.suggestions.map((s) => (
                  <button
                    key={s.type}
                    onClick={() => {
                      // For now, just dismiss on any action
                      setDismissed((prev) => new Set([...prev, o.meetingId]));
                    }}
                    className="w-full flex items-start gap-2 text-left border border-[#808080]/10 px-3 py-2 hover:bg-[#F8F8F8]/5 transition-colors"
                  >
                    <span className="text-xs mt-0.5">
                      {s.type === "keep_both" ? "✓" : s.type === "shorten_timer" ? "✂" : s.type === "split_time" ? "↔" : "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">{s.label}</p>
                      <p className="text-xs text-[#808080] mt-0.5">{s.reason}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
