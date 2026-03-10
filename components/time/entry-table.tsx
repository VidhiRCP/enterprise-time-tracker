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
      <div className="rounded-xl border border-dashed border-[#808080]/30 p-6 text-sm text-[#808080]">
        No entries yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#808080]/30">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Date</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Project</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Started</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Stopped</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Duration</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Source</th>
            <th className="border-b border-[#808080]/30 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-[#808080]">Notes</th>
            <th className="border-b border-[#808080]/30 px-3 py-3 w-8"></th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-[#F8F8F8]/5 transition-colors">
              <td className="border-b border-[#808080]/10 px-4 py-3 text-[#D9D9D9]">
                {format(new Date(entry.workDate), "yyyy-MM-dd")}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 font-bold">
                {entry.project.projectName}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 text-[#D9D9D9]">
                {entry.timerSession?.startedAt
                  ? formatTime(entry.timerSession.startedAt)
                  : <span className="text-[#808080]">—</span>}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 text-[#D9D9D9]">
                {entry.timerSession?.stoppedAt
                  ? formatTime(entry.timerSession.stoppedAt)
                  : <span className="text-[#808080]">—</span>}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 font-bold">
                {formatMinutes(entry.durationMinutes)}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 text-[#D9D9D9]">
                {entry.source === "TIMER" ? (
                  <span className="border-b border-[#F40000] pb-px">Timer</span>
                ) : entry.source}
              </td>
              <td className="border-b border-[#808080]/10 px-4 py-3 text-[#D9D9D9]">
                {entry.notes ?? "—"}
              </td>
              <td className="border-b border-[#808080]/10 px-3 py-3 text-center">
                <DeleteButton entryId={entry.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}