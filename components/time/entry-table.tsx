"use client";

import { format } from "date-fns";
import { useState, useTransition, useMemo } from "react";
import { formatMinutes } from "@/lib/time";
import { deleteTimeEntry, updateManualEntry } from "@/lib/actions";
import { useDashboardFilter } from "@/lib/dashboard-filter-context";
import DateInput from "../ui/date-input";

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

type ProjectOption = {
  projectId: string;
  projectName: string;
};

function formatTime(date: Date | string) {
  return format(new Date(date), "HH:mm");
}

/** Derive display duration from wall-clock start/stop for TIMER entries.
 *  Truncate both timestamps to the displayed minute (floor) so the number
 *  always matches the HH:MM → HH:MM range the user sees. */
function effectiveDuration(entry: Entry): number {
  if (entry.timerSession?.startedAt && entry.timerSession?.stoppedAt) {
    const start = new Date(entry.timerSession.startedAt);
    const stop = new Date(entry.timerSession.stoppedAt);
    start.setSeconds(0, 0);
    stop.setSeconds(0, 0);
    return Math.max(1, Math.round((stop.getTime() - start.getTime()) / 60_000));
  }
  return entry.durationMinutes;
}

/* ── Source badge ── */
function SourceBadge({ source }: { source: string }) {
    if (source === "TIMER") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full brand-soft px-2 py-0.5 text-xs font-bold brand-text border brand-border" style={{ borderStyle: 'solid', borderWidth: 1 }}>
        ⏱ Timer
      </span>
    );
  }
  if (source === "MANUAL") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#808080]/15 px-2 py-0.5 text-xs font-bold text-[#D9D9D9] border border-[#808080]/30">
        ✏ Manual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-0.5 text-xs font-bold text-yellow-400 border border-yellow-500/30">
      ♻ {source}
    </span>
  );
}

/* ── Delete button ── */
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

/* ── Inline edit form for MANUAL entries ── */
function EditManualRow({
  entry,
  projects,
  onClose,
}: {
  entry: Entry;
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState(entry.project.projectId);
  const [workDate, setWorkDate] = useState(format(new Date(entry.workDate), "yyyy-MM-dd"));
  const [durationMinutes, setDurationMinutes] = useState(String(entry.durationMinutes));
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError("");
    startTransition(async () => {
      const result = await updateManualEntry({
        entryId: entry.id,
        projectId,
        workDate,
        durationMinutes: Number(durationMinutes),
        notes,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div className="brand-border brand-soft p-3 space-y-2" style={{ borderStyle: 'solid', borderWidth: 1 }}>
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-bold brand-text uppercase tracking-wider">Edit Manual Entry</span>
        <button onClick={onClose} className="text-xs text-[#808080] hover:text-[#D9D9D9]">Cancel</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none app-input"
        >
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>{p.projectName} ({p.projectId})</option>
          ))}
        </select>
        <DateInput
          value={workDate}
          onChange={(v) => setWorkDate(v)}
          className=""
        />
        <input
          type="number"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          min={1}
          placeholder="Minutes"
          className="border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none app-input"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="btn btn-sm btn-primary"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes"
        className="w-full border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none app-input"
      />
      {error && (
        <div className="text-xs text-[#F40000]">{error}</div>
      )}
    </div>
  );
}

/* ── Main component ── */
export function EntryTable({
  entries,
  projects,
  calendarDate,
  onClearCalendarDate,
}: {
  entries: Entry[];
  projects: ProjectOption[];
  calendarDate?: string | null;
  onClearCalendarDate?: () => void;
}) {
  const { projectFilter, weekStart, weekEnd } = useDashboardFilter();
  const [editingId, setEditingId] = useState<string | null>(null);

  // Filter entries by shared project filter, week range, and calendar date
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (projectFilter !== "ALL" && e.project.projectId !== projectFilter) return false;

      // Calendar date filter (from sidebar) takes priority over week filter
      if (calendarDate) {
        const d = new Date(e.workDate);
        const entryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (entryDate !== calendarDate) return false;
      } else {
        // Week filter from shared context
        const d = new Date(e.workDate);
        const entryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (entryDate < weekStart || entryDate > weekEnd) return false;
      }
      return true;
    });
  }, [entries, projectFilter, calendarDate, weekStart, weekEnd]);

  // Sort entries by date descending (most recent first)
  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.workDate).getTime() - new Date(a.workDate).getTime()
    );
  }, [filtered]);

  // Export removed from per-table UI. Use centralized Export Data dialog instead.

  if (!entries.length) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-xs sm:text-sm text-[#808080]">
        No entries yet.
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ── Calendar date badge ── */}
      {calendarDate && (
        <div className="flex items-center gap-2 brand-border brand-soft px-3 py-2" style={{ borderStyle: 'solid', borderWidth: 1 }}>
          <span className="text-sm text-[#D9D9D9]">
            📅 Showing entries for <span className="font-bold text-[#F8F8F8]">{format(new Date(calendarDate + "T12:00:00"), "EEEE, dd MMM yyyy")}</span>
          </span>
          <button
            onClick={onClearCalendarDate}
            className="ml-auto text-xs text-[#808080] hover:text-[#F40000] transition-colors"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* ── Entry count summary ── */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[#808080]">
          {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · {formatMinutes(filtered.reduce((s, e) => s + effectiveDuration(e), 0))}
        </span>
      </div>

      {/* ── Empty state ── */}
      {sorted.length === 0 && (
        <div className="border border-dashed border-[#808080]/30 p-4 text-xs text-[#808080]">
          No entries match filters.
        </div>
      )}

      {sorted.length > 0 && (
        <>
          {/* ── Mobile: stacked cards ── */}
          <div className="space-y-3 md:hidden">
            {sorted.map((entry) => (
              <div key={entry.id}>
                {editingId === entry.id ? (
                  <EditManualRow entry={entry} projects={projects} onClose={() => setEditingId(null)} />
                ) : (
                  <div className="border border-[#808080]/30 p-3 sm:p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-bold">
                          {entry.project.projectName}{" "}
                          <span className="text-xs font-normal text-[#808080]">({entry.project.projectId})</span>
                        </div>
                        <div className="text-xs text-[#808080] mt-0.5">
                          {format(new Date(entry.workDate), "dd-MM-yyyy")}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {entry.source === "MANUAL" && (
                          <button
                            onClick={() => setEditingId(entry.id)}
                            className="btn-edit"
                            title="Edit entry"
                          >
                            ✎
                          </button>
                        )}
                        <DeleteButton entryId={entry.id} />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#D9D9D9] items-center">
                      <span className="font-bold text-[#F8F8F8]">{formatMinutes(effectiveDuration(entry))}</span>
                      <SourceBadge source={entry.source} />
                      {entry.timerSession?.startedAt && (
                        <span className="text-[#808080]">
                          {formatTime(entry.timerSession.startedAt)} → {entry.timerSession.stoppedAt ? formatTime(entry.timerSession.stoppedAt) : "…"}
                        </span>
                      )}
                    </div>

                    {entry.notes && (
                      <div className="text-xs text-[#808080] truncate">{entry.notes}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Desktop: full table ── */}
          <div className="hidden md:block overflow-x-auto border border-[#808080]/10">
            <table className="min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-black">
                <tr>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Date</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Project</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Started</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Stopped</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Duration</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Source</th>
                  <th className="border-b border-[#808080]/30 px-3 lg:px-4 py-2 lg:py-3 text-left text-xs lg:text-sm font-bold uppercase tracking-wider text-[#808080]">Notes</th>
                  <th className="border-b border-[#808080]/30 px-2 lg:px-3 py-2 lg:py-3 w-14"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => (
                  editingId === entry.id ? (
                    <tr key={entry.id}>
                      <td colSpan={8} className="border-b border-[#808080]/10 p-2">
                        <EditManualRow entry={entry} projects={projects} onClose={() => setEditingId(null)} />
                      </td>
                    </tr>
                  ) : (
                    <tr key={entry.id} className="hover:bg-[#F8F8F8]/5 even:bg-[#F8F8F8]/[0.02] transition-colors">
                      <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9] whitespace-nowrap">
                        {format(new Date(entry.workDate), "dd-MM-yyyy")}
                      </td>
                      <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3">
                        <span className="font-bold">{entry.project.projectName}</span>
                        <span className="ml-1 text-xs text-[#808080]">({entry.project.projectId})</span>
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
                      <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 font-bold tabular-nums">
                        {formatMinutes(effectiveDuration(entry))}
                      </td>
                      <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3">
                        <SourceBadge source={entry.source} />
                      </td>
                      <td className="border-b border-[#808080]/10 px-3 lg:px-4 py-2 lg:py-3 text-[#D9D9D9] max-w-[200px] truncate">
                        {entry.notes ?? "—"}
                      </td>
                      <td className="border-b border-[#808080]/10 px-2 lg:px-3 py-2 lg:py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {entry.source === "MANUAL" && (
                            <button
                              onClick={() => setEditingId(entry.id)}
                              className="btn-edit"
                              title="Edit entry"
                            >
                              ✎
                            </button>
                          )}
                          <DeleteButton entryId={entry.id} />
                        </div>
                      </td>
                    </tr>
                  )
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}