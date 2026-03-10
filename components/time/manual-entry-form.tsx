"use client";

import { useState, useTransition } from "react";
import { createManualEntry } from "@/lib/actions";
import { localDateInputValue } from "@/lib/time";

type ProjectOption = {
  projectId: string;
  projectName: string;
};

export function ManualEntryForm({ projects }: { projects: ProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.projectId ?? "");
  const [workDate, setWorkDate] = useState(localDateInputValue());
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
    <div className="space-y-3 sm:space-y-4">
      {/* Project */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[#D9D9D9]">Project</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
        >
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName} ({project.projectId})
            </option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[#D9D9D9]">Date</label>
        <input
          type="date"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
        />
      </div>

      {/* Duration mode toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[#808080]">Entry type:</span>
        <button
          type="button"
          onClick={() => setMode("duration")}
          className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors ${
            mode === "duration"
              ? "bg-[#F40000] text-white"
              : "border border-[#808080]/30 text-[#808080] hover:text-[#D9D9D9]"
          }`}
        >
          Duration
        </button>
        <button
          type="button"
          onClick={() => setMode("range")}
          className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors ${
            mode === "range"
              ? "bg-[#F40000] text-white"
              : "border border-[#808080]/30 text-[#808080] hover:text-[#D9D9D9]"
          }`}
        >
          Start / End Time
        </button>
      </div>

      {mode === "duration" ? (
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Duration (minutes)</label>
          <input
            type="number"
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            min={1}
            step={1}
            placeholder="60"
            className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-[#D9D9D9]">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-[#D9D9D9]">End time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
            />
          </div>
          {computedDuration && (
            <div className="sm:col-span-2 text-xs sm:text-sm text-[#808080]">
              Calculated: <span className="font-bold text-[#D9D9D9]">{Math.floor(computedDuration / 60)}h {computedDuration % 60}m</span>
            </div>
          )}
        </div>
      )}

      {/* Notes (required) */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[#D9D9D9]">
          Notes <span className="text-[#F40000]">*</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setError(""); }}
          rows={2}
          className={`w-full rounded-xl border bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none ${
            error && !notes.trim() ? "border-[#F40000]" : "border-[#808080]/30"
          }`}
          placeholder="Describe the work done (required)"
        />
      </div>

      {/* Error / Success messages */}
      {error && (
        <div className="rounded-lg border border-[#F40000]/30 bg-[#F40000]/10 px-3 py-2 text-xs sm:text-sm text-[#F40000]">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs sm:text-sm text-green-400">
          ✓ Entry saved successfully
        </div>
      )}

      <button
        type="button"
        disabled={isPending}
        onClick={handleSubmit}
        className="rounded-xl border border-[#808080]/30 px-4 py-2 text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
      >
        {isPending ? "Saving…" : "Save manual entry"}
      </button>
    </div>
  );
}