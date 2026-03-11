"use client";

import { format, startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import { useState, useTransition, useMemo, useCallback } from "react";
import { formatMinutes, localDateInputValue } from "@/lib/time";
import { deleteTimeEntry, updateManualEntry } from "@/lib/actions";

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
      <span className="inline-flex items-center gap-1 rounded-full bg-[#F40000]/15 px-2 py-0.5 text-xs font-bold text-[#F40000] border border-[#F40000]/30">
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
    <div className="border border-[#F40000]/30 bg-[#F40000]/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs sm:text-sm font-bold text-[#F40000] uppercase tracking-wider">Edit Manual Entry</span>
        <button onClick={onClose} className="text-xs text-[#808080] hover:text-[#D9D9D9]">Cancel</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>{p.projectName} ({p.projectId})</option>
          ))}
        </select>
        <input
          type="date"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
        />
        <input
          type="number"
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(e.target.value)}
          min={1}
          placeholder="Minutes"
          className="border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-[#F40000] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#F40000]/80 transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="Notes (required)"
        className="w-full border border-[#808080]/30 bg-black px-2 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
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
  const [filterProject, setFilterProject] = useState("ALL");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const hasActiveFilters = filterProject !== "ALL" || filterFrom !== "" || filterTo !== "";

  // Filter entries
  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterProject !== "ALL" && e.project.projectId !== filterProject) return false;
      const d = new Date(e.workDate);
      // Calendar date filter (from sidebar)
      if (calendarDate) {
        const entryDate = d.toISOString().slice(0, 10);
        if (entryDate !== calendarDate) return false;
      }
      if (filterFrom) {
        const from = parseISO(filterFrom);
        if (d < from) return false;
      }
      if (filterTo) {
        const to = parseISO(filterTo);
        to.setHours(23, 59, 59, 999);
        if (d > to) return false;
      }
      return true;
    });
  }, [entries, filterProject, filterFrom, filterTo, calendarDate]);

  // Group by week (Monday start)
  const weekGroups = useMemo(() => {
    const groups = new Map<string, { weekStart: Date; weekEnd: Date; entries: Entry[]; total: number }>();

    for (const entry of filtered) {
      const d = new Date(entry.workDate);
      const ws = startOfWeek(d, { weekStartsOn: 1 });
      const we = endOfWeek(d, { weekStartsOn: 1 });
      const key = ws.toISOString();
      if (!groups.has(key)) {
        groups.set(key, { weekStart: ws, weekEnd: we, entries: [], total: 0 });
      }
      const g = groups.get(key)!;
      g.entries.push(entry);
      g.total += effectiveDuration(entry);
    }

    // Sort weeks descending (most recent first)
    return Array.from(groups.values()).sort(
      (a, b) => b.weekStart.getTime() - a.weekStart.getTime()
    );
  }, [filtered]);

  // Get unique projects from entries for filter dropdown
  const uniqueProjects = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) {
      map.set(e.project.projectId, e.project.projectName);
    }
    return Array.from(map.entries());
  }, [entries]);

  async function exportToExcel(data: Entry[]) {
    const XLSX = await import("xlsx");
    const rows = data.map((e) => ({
      Date: format(new Date(e.workDate), "yyyy-MM-dd"),
      Project: e.project.projectName,
      "Project ID": e.project.projectId,
      Started: e.timerSession?.startedAt ? format(new Date(e.timerSession.startedAt), "HH:mm") : "",
      Stopped: e.timerSession?.stoppedAt ? format(new Date(e.timerSession.stoppedAt), "HH:mm") : "",
      "Duration (min)": effectiveDuration(e),
      Duration: formatMinutes(effectiveDuration(e)),
      Source: e.source,
      Notes: e.notes ?? "",
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0] ?? {}).map((key) => {
      const maxLen = Math.max(key.length, ...rows.map((r) => String((r as any)[key]).length));
      return { wch: Math.min(maxLen + 2, 40) };
    });
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Time Entries");
    XLSX.writeFile(wb, `time-entries-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  }

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
        <div className="flex items-center gap-2 border border-[#F40000]/30 bg-[#F40000]/5 px-3 py-2">
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

      {/* ── Filter toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setFiltersOpen((v) => !v)}
          className={`border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            hasActiveFilters
              ? "border-[#F40000]/40 text-[#F40000] bg-[#F40000]/5"
              : "border-[#808080]/30 text-[#808080] hover:text-[#D9D9D9]"
          }`}
        >
          {filtersOpen ? "▾ Filter" : "▸ Filter"}{hasActiveFilters ? " · Active" : ""}
        </button>
        {hasActiveFilters && (
          <button
            onClick={() => { setFilterProject("ALL"); setFilterFrom(""); setFilterTo(""); }}
            className="text-xs text-[#808080] hover:text-[#F40000] transition-colors"
          >
            ✕ Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-[#808080]">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"} · {formatMinutes(filtered.reduce((s, e) => s + effectiveDuration(e), 0))}
          </span>
          <button
            onClick={() => exportToExcel(filtered)}
            disabled={filtered.length === 0}
            className="border border-[#808080]/30 px-2.5 py-1.5 text-xs font-medium text-[#D9D9D9] hover:text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
          >
            ⬇ Export
          </button>
        </div>
      </div>

      {/* Collapsible filter fields */}
      {filtersOpen && (
        <div className="flex flex-wrap items-end gap-3 border-l-2 border-l-[#F40000]/30 pl-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#D9D9D9]">Project</label>
            <select
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
              className="w-full border border-[#808080]/30 bg-black px-2.5 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
            >
              <option value="ALL">All projects</option>
              {uniqueProjects.map(([id, name]) => (
                <option key={id} value={id}>{name} ({id})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#D9D9D9]">From</label>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="w-full border border-[#808080]/30 bg-black px-2.5 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#D9D9D9]">To</label>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="w-full border border-[#808080]/30 bg-black px-2.5 py-1.5 text-xs focus:border-[#F40000] focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* ── Weekly grouped entries ── */}
      {weekGroups.length === 0 && (
        <div className="border border-dashed border-[#808080]/30 p-4 text-xs text-[#808080]">
          No entries match filters.
        </div>
      )}

      {weekGroups.map((group) => (
        <div key={group.weekStart.toISOString()} className="space-y-3">
          {/* Week header */}
          <div className="flex items-center justify-between px-1 py-1">
            <span className="text-xs sm:text-sm font-bold text-[#808080] uppercase tracking-wider">
              Week of {format(group.weekStart, "MMM d")} – {format(group.weekEnd, "MMM d, yyyy")}
            </span>
            <span className="text-xs sm:text-sm font-bold text-[#D9D9D9]">
              {formatMinutes(group.total)}
            </span>
          </div>

          {/* ── Mobile: stacked cards ── */}
          <div className="space-y-3 md:hidden">
            {group.entries.map((entry) => (
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
                            className="text-xs text-[#808080] hover:text-[#D9D9D9] transition-colors"
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
          <div className="hidden md:block overflow-x-auto">
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
                {group.entries.map((entry) => (
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
                              className="text-xs text-[#808080] hover:text-[#D9D9D9] transition-colors"
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
        </div>
      ))}
    </div>
  );
}