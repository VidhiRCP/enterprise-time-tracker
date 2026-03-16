"use client";

import { useState, useTransition } from "react";
import { createManualEntry } from "@/lib/actions";
import { localDateInputValue, formatMinutes } from "@/lib/time";

type ProjectOption = {
  projectId: string;
  projectName: string;
};

export function ManualEntryForm({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? "");
  const workDate = localDateInputValue();
  const [mode, setMode] = useState<"duration" | "range">("range");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Auto-calculate duration from range
  const computedDuration = (() => {
    if (mode !== "range" || !startTime || !endTime) return null;
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return diff > 0 ? diff : null;
  })();

  function resetForm() {
    setDurationMinutes("");
    setStartTime("");
    setEndTime("");
    setNotes("");
    setError("");
    setSuccess(false);
  }

  function handleSubmit() {
    setError("");
    setSuccess(false);

    startTransition(async () => {
      const result = await createManualEntry({
        projectId,
        workDate,
        durationMinutes: mode === "duration" ? Number(durationMinutes) : undefined,
        startTime: mode === "range" ? startTime : undefined,
        endTime: mode === "range" ? endTime : undefined,
        notes,
      });

      if (result.error) {
        setError(result.error);
      } else {
        resetForm();
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* ── Row 1: Project + Date side by side ── */}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Project</label>
            <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
              className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none app-input"
          >
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.projectName} ({project.projectId})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Date</label>
            <div className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-sm text-[#D9D9D9] app-input">
            📅 Today
          </div>
        </div>
      </div>

      {/* ── Row 2: Mode toggle + time/duration inputs inline ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Mode toggle */}
        <div className="space-y-1 shrink-0">
          <label className="text-sm font-medium text-[#D9D9D9]">Entry Type</label>
          <div className="flex border border-[#808080]/30 overflow-hidden">
            <button
              type="button"
              onClick={() => setMode("duration")}
              className={`btn btn-sm ${mode === "duration" ? 'btn-primary' : 'btn-ghost'}`}
            >
              Duration
            </button>
            <button
              type="button"
              onClick={() => setMode("range")}
              className={`btn btn-sm border-l border-[#808080]/30 ${mode === "range" ? 'btn-primary' : 'btn-ghost'}`}
            >
              Start / End
            </button>
          </div>
        </div>

        {/* Time / Duration inputs */}
        {mode === "duration" ? (
          <div className="flex-1 space-y-1">
            <label className="text-sm font-medium text-[#D9D9D9]">Minutes</label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min={1}
              step={1}
              placeholder="60"
               className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none app-input"
            />
          </div>
        ) : (
          <div className="flex-1 grid gap-3 grid-cols-2 items-end">
            <div className="space-y-1">
              <label className="text-sm font-medium text-[#D9D9D9]">Start Time</label>
                <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                 className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none app-input"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#D9D9D9]">End Time</label>
                {computedDuration && (
                  <span className="text-xs text-[#808080]">
                    = <span className="font-bold text-[#D9D9D9]">{formatMinutes(computedDuration)}</span>
                  </span>
                )}
              </div>
                <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                 className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none app-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Row 3: Notes + Submit side by side ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setError(""); }}
             className={`w-full border bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none app-input ${
               "border-[#808080]/30"
             }`}
            placeholder="Describe the work done"
          />
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="shrink-0 border border-[#808080]/30 px-5 py-2 text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save entry"}
        </button>
      </div>

      {/* Error / Success messages */}
      {error && (
        <div className="brand-border brand-soft px-3 py-2 text-xs sm:text-sm brand-text" style={{ borderStyle: 'solid', borderWidth: 1 }}>
          {error}
        </div>
      )}
      {success && (
        <div className="border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs sm:text-sm text-green-400">
          ✓ Entry saved successfully
        </div>
      )}
    </div>
  );
}