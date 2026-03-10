"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  createOrResumeSession,
  pauseSession,
  heartbeatSession,
  finalizeSession,
  discardSession,
} from "@/lib/actions";
import { formatSeconds, localDateInputValue } from "@/lib/time";

type ProjectOption = {
  projectId: string;
  projectName: string;
};

type SessionData = {
  id: string;
  projectId: string;
  notesDraft: string | null;
  accumulatedSeconds: number;
  status: "RUNNING" | "PAUSED";
  startedAt: string;
  lastResumedAt: string | null;
};

export function TimerPanel({
  projects,
  activeSession,
}: {
  projects: ProjectOption[];
  activeSession: SessionData | null;
}) {
  const [projectId, setProjectId] = useState(activeSession?.projectId ?? projects[0]?.projectId ?? "");
  const [notesDraft, setNotesDraft] = useState(activeSession?.notesDraft ?? "");
  const [session, setSession] = useState<SessionData | null>(activeSession);
  const [isPending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [lastAutosaved, setLastAutosaved] = useState<Date | null>(null);
  const [notesError, setNotesError] = useState("");

  // Tick every second for live timer
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Compute elapsed — tick forces re-render every second
  const elapsedSeconds = useMemo(() => {
    void tick;
    if (!session) return 0;
    if (session.status === "PAUSED") return session.accumulatedSeconds;
    const last = session.lastResumedAt
      ? new Date(session.lastResumedAt).getTime()
      : Date.now();
    return session.accumulatedSeconds + Math.floor((Date.now() - last) / 1000);
  }, [session, tick]);

  // Heartbeat every 10s
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      const currentElapsed =
        session.status === "PAUSED"
          ? session.accumulatedSeconds
          : session.accumulatedSeconds +
            Math.floor(
              (Date.now() - new Date(session.lastResumedAt ?? Date.now()).getTime()) / 1000
            );
      heartbeatSession({
        sessionId: session.id,
        projectId,
        notesDraft,
        elapsedSeconds: currentElapsed,
      }).then(() => setLastAutosaved(new Date())).catch(console.error);
    }, 10000);
    return () => window.clearInterval(id);
  }, [session, projectId, notesDraft]);

  // Warn on page close
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!session) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [session]);

  const isRunning = session?.status === "RUNNING";
  const isPaused = session?.status === "PAUSED";
  const hasSession = !!session;
  const selectedProject = projects.find((p) => p.projectId === projectId);

  function handleProjectChange(newProjectId: string) {
    if (isRunning && newProjectId !== projectId) {
      if (!confirm("Timer is running. Switch project? The timer will continue.")) return;
    }
    setProjectId(newProjectId);
  }

  function validateNotes(): boolean {
    if (!notesDraft.trim()) {
      setNotesError("Notes are required before saving.");
      return false;
    }
    setNotesError("");
    return true;
  }

  function getStartLabel() {
    if (!hasSession) return "▶ Start Timer";
    if (isPaused) return "▶ Resume";
    return "● Running…";
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Timer display + current project */}
      <div>
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-[#808080]">Current timer</div>
        <div className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">
          {formatSeconds(elapsedSeconds)}
        </div>
        <div className="mt-1 sm:mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
          {hasSession ? (
            <>
              <span className={isRunning ? "text-[#F40000]" : "text-[#808080]"}>●</span>
              <span className="text-[#D9D9D9]">{isRunning ? "Running" : "Paused"}</span>
              <span className="text-[#808080]">—</span>
              <span className="font-bold text-[#F8F8F8]">{selectedProject?.projectName ?? "—"}</span>
              <span className="text-[#808080] text-[10px] sm:text-xs">({projectId})</span>
            </>
          ) : (
            <span className="text-[#D9D9D9]">No active timer</span>
          )}
        </div>
        {lastAutosaved && hasSession && (
          <div className="mt-1 text-[10px] text-[#808080]/60">
            Last autosaved: {lastAutosaved.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Project selector */}
      <div className="space-y-1">
        <label className="text-xs sm:text-sm font-medium text-[#D9D9D9]">Project</label>
        <select
          value={projectId}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm focus:border-[#F40000] focus:outline-none"
        >
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName} ({project.projectId})
            </option>
          ))}
        </select>
      </div>

      {/* Notes (required) */}
      <div className="space-y-1">
        <label className="text-xs sm:text-sm font-medium text-[#D9D9D9]">
          Notes <span className="text-[#F40000]">*</span>
        </label>
        <textarea
          value={notesDraft}
          onChange={(e) => { setNotesDraft(e.target.value); setNotesError(""); }}
          rows={2}
          className={`w-full rounded-xl border bg-black px-3 py-2 text-xs sm:text-sm focus:border-[#F40000] focus:outline-none ${
            notesError ? "border-[#F40000]" : "border-[#808080]/30"
          }`}
          placeholder="What are you working on? (required)"
        />
        {notesError && (
          <p className="text-[10px] sm:text-xs text-[#F40000]">{notesError}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          disabled={isPending || !projectId || isRunning}
          onClick={() =>
            startTransition(async () => {
              const now = new Date().toISOString();
              setSession((prev) => ({
                id: prev?.id ?? "_pending",
                projectId,
                notesDraft,
                accumulatedSeconds: prev?.accumulatedSeconds ?? 0,
                status: "RUNNING",
                startedAt: prev?.startedAt ?? now,
                lastResumedAt: now,
              }));
              const result = await createOrResumeSession({ projectId, notes: notesDraft });
              setSession({
                id: result.id,
                projectId: result.projectId,
                notesDraft: result.notesDraft,
                accumulatedSeconds: result.accumulatedSeconds,
                status: result.status as "RUNNING" | "PAUSED",
                startedAt: result.startedAt.toISOString(),
                lastResumedAt: result.lastResumedAt?.toISOString() ?? null,
              });
            })
          }
          className="rounded-xl bg-[#F40000] px-3 py-2 text-xs sm:text-sm font-bold text-[#F8F8F8] hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {getStartLabel()}
        </button>

        <button
          disabled={isPending || !isRunning}
          onClick={() =>
            startTransition(async () => {
              setSession({ ...session!, accumulatedSeconds: elapsedSeconds, status: "PAUSED", lastResumedAt: null, notesDraft });
              await pauseSession({ sessionId: session!.id, elapsedSeconds, notesDraft });
            })
          }
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-medium text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors disabled:opacity-40"
        >
          <span className="text-[1em]">⏸</span> Pause
        </button>

        <button
          disabled={isPending || !hasSession}
          onClick={() => {
            if (!validateNotes()) return;
            startTransition(async () => {
              const sid = session!.id;
              setSession(null);
              setNotesDraft("");
              setNotesError("");
              setLastAutosaved(null);
              await finalizeSession({ sessionId: sid, projectId, elapsedSeconds, notesDraft, workDate: localDateInputValue() });
            });
          }}
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
        >
          <span className="text-[1em]">💾</span> Save tracked time
        </button>

        <button
          disabled={isPending || !hasSession}
          onClick={() => {
            if (!confirm("Discard this session? All tracked time will be lost.")) return;
            startTransition(async () => {
              const sid = session!.id;
              setSession(null);
              setNotesDraft("");
              setNotesError("");
              setLastAutosaved(null);
              await discardSession({ sessionId: sid, elapsedSeconds, notesDraft });
            });
          }}
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-medium text-[#F40000] hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          <span className="text-[1em]">🗑</span> Discard
        </button>
      </div>
    </div>
  );
}