"use client";

import { format } from "date-fns";
import { useTransition } from "react";
import { formatMinutes } from "@/lib/time";
import { deleteTimeEntry } from "@/lib/actions";

type Entry = {
  id: string;
  workDate: Date;
  durationMinutes: number;
  notes: string | null;
  source: string;
  status: string;
  project: {
    projectId: string;
    projectName: string;
  };
  timerSession?: {
    startedAt: Date;
    stoppedAt: Date | null;
  } | null;
};

function formatTime(date: Date | string) {
  return format(new Date(date), "HH:mm");
}

function DeleteButton({ entryId }: { entryId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        if (!confirm("Delete this entry? This cannot be undone.")) return;
        startTransition(async () => {
          await deleteTimeEntry(entryId);
        });
      }}
      className="text-xs text-[#808080] hover:text-[#F40000] transition-colors disabled:opacity-40"
      title="Delete entry"
    >
      {isPending ? "…" : "✕"}
    </button>
  );
}

export function EntryTable({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return (
      <div className="rounded-xl border border-dashed border-[#808080]/30 p-4 sm:p-6 text-xs sm:text-sm text-[#808080]">
        No entries yet.
      </div>
    );
  }

  return (
    <>
      {/* ── Mobile: stacked card layout ── */}
      <div className="space-y-3 md:hidden">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="rounded-xl border border-[#808080]/30 p-3 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{entry.project.projectName}</div>
                <div className="text-xs text-[#808080] mt-0.5">
                  {format(new Date(entry.workDate), "dd-MM-yyyy")}
                </div>
              </div>
              <DeleteButton entryId={entry.id} />
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#D9D9D9]">
              <span className="font-bold text-[#F8F8F8]">{formatMinutes(entry.durationMinutes)}</span>
              <span>
                {entry.source === "TIMER" ? (
                  <span className="border-b border-[#F40000] pb-px">Timer</span>
                ) : entry.source}
              </span>
              {entry.timerSession?.startedAt && (
                <span>{formatTime(entry.timerSession.startedAt)} → {entry.timerSession.stoppedAt ? formatTime(entry.timerSession.stoppedAt) : "…"}</span>
              )}
            </div>

            {entry.notes && (
              <div className="text-xs text-[#808080] truncate">{entry.notes}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Desktop: full table ── */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[#808080]/30">
        <table className="min-w-full border-collapse text-xs lg:text-sm">
          <thead>
            <tr>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Date</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Project</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Started</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Stopped</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Duration</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Source</th>
              <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-[10px] lg:text-xs font-bold uppercase tracking-wider text-[#808080]">Notes</th>
              <th className="border-b border-[#808080]/30 px-2 lg:px-3 py-2 lg:py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-[#F8F8F8]/5 transition-colors">
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9] whitespace-nowrap">
                  {format(new Date(entry.workDate), "dd-MM-yyyy")}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 font-bold">
                  {entry.project.projectName}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9]">
                  {entry.timerSession?.startedAt
                    ? formatTime(entry.timerSession.startedAt)
                    : <span className="text-[#808080]">—</span>}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9]">
                  {entry.timerSession?.stoppedAt
                    ? formatTime(entry.timerSession.stoppedAt)
                    : <span className="text-[#808080]">—</span>}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 font-bold">
                  {formatMinutes(entry.durationMinutes)}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9]">
                  {entry.source === "TIMER" ? (
                    <span className="border-b border-[#F40000] pb-px">Timer</span>
                  ) : entry.source}
                </td>
                <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9] max-w-[200px] truncate">
                  {entry.notes ?? "—"}
                </td>
                <td className="border-b border-[#808080]/10 px-2 lg:px-3 py-2 lg:py-3 text-center">
                  <DeleteButton entryId={entry.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}