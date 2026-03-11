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
    <div className="space-y-4">
      {/* ── Row 1: Timer display + action buttons ── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-[#808080]">Current timer</div>
          <div className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums mt-1">
            {formatSeconds(elapsedSeconds)}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm mt-1">
            {hasSession ? (
              <>
                <span className={isRunning ? "text-[#F40000]" : "text-[#808080]"}>●</span>
                <span className="text-[#D9D9D9]">{isRunning ? "Running" : "Paused"}</span>
                <span className="text-[#808080]">—</span>
                <span className="font-bold text-[#F8F8F8] truncate">{selectedProject?.projectName ?? "—"}</span>
              </>
            ) : (
              <span className="text-[#808080]">No active timer</span>
            )}
          </div>
          {lastAutosaved && hasSession && (
            <div className="text-xs text-[#808080]/60 mt-1">
              Autosaved: {lastAutosaved.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Action buttons — inline row */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            disabled={isPending || !projectId || isRunning}
            onClick={() => {
              const now = new Date().toISOString();
              const prev = session;
              setSession((s) => ({
                id: s?.id ?? "_pending",
                projectId,
                notesDraft,
                accumulatedSeconds: s?.accumulatedSeconds ?? 0,
                status: "RUNNING",
                startedAt: s?.startedAt ?? now,
                lastResumedAt: now,
              }));
              startTransition(async () => {
                try {
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
                } catch {
                  setSession(prev);
                }
              });
            }}
            className="bg-[#F40000] px-4 py-2 text-sm font-bold text-[#F8F8F8] hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {getStartLabel()}
          </button>

          <button
            disabled={isPending || !isRunning}
            onClick={() => {
              const prev = session;
              const frozenElapsed = elapsedSeconds;
              setSession({ ...session!, accumulatedSeconds: frozenElapsed, status: "PAUSED", lastResumedAt: null, notesDraft });
              startTransition(async () => {
                try {
                  await pauseSession({ sessionId: session!.id, elapsedSeconds: frozenElapsed, notesDraft });
                } catch {
                  setSession(prev);
                }
              });
            }}
            className="border border-[#808080]/30 px-4 py-2 text-sm font-medium text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors disabled:opacity-40"
          >
            ⏸ Pause
          </button>

          <button
            disabled={isPending || !hasSession}
            onClick={() => {
              if (!validateNotes()) return;
              const prev = session;
              const sid = session!.id;
              const frozenElapsed = elapsedSeconds;
              const frozenNotes = notesDraft;
              setSession(null);
              setNotesDraft("");
              setNotesError("");
              setLastAutosaved(null);
              startTransition(async () => {
                try {
                  await finalizeSession({ sessionId: sid, projectId, elapsedSeconds: frozenElapsed, notesDraft: frozenNotes, workDate: localDateInputValue() });
                } catch {
                  setSession(prev);
                  setNotesDraft(frozenNotes);
                }
              });
            }}
            className="border border-[#808080]/30 px-4 py-2 text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
          >
            💾 Save Session
          </button>

          <button
            disabled={isPending || !hasSession}
            onClick={() => {
              if (!confirm("Discard this session? All tracked time will be lost.")) return;
              const prev = session;
              const sid = session!.id;
              const frozenElapsed = elapsedSeconds;
              const frozenNotes = notesDraft;
              setSession(null);
              setNotesDraft("");
              setNotesError("");
              setLastAutosaved(null);
              startTransition(async () => {
                try {
                  await discardSession({ sessionId: sid, elapsedSeconds: frozenElapsed, notesDraft: frozenNotes });
                } catch {
                  setSession(prev);
                  setNotesDraft(frozenNotes);
                }
              });
            }}
            className="border border-[#808080]/30 px-4 py-2 text-sm font-medium text-[#F40000] hover:opacity-80 transition-opacity disabled:opacity-40"
          >
            🗑 Discard
          </button>
        </div>
      </div>

      {/* ── Row 2: Project + Notes side by side ── */}
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Project</label>
          <select
            value={projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            className="w-full border border-[#808080]/30 bg-black px-2.5 py-1.5 text-sm focus:border-[#F40000] focus:outline-none"
          >
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.projectName} ({project.projectId})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">
            Notes <span className="text-[#F40000]">*</span>
          </label>
          <textarea
            value={notesDraft}
            onChange={(e) => { setNotesDraft(e.target.value); setNotesError(""); }}
            rows={2}
            className={`w-full border bg-black px-2.5 py-1.5 text-sm focus:border-[#F40000] focus:outline-none ${
              notesError ? "border-[#F40000]" : "border-[#808080]/30"
            }`}
            placeholder="What are you working on? (required)"
          />
          {notesError && (
            <p className="text-xs text-[#F40000]">{notesError}</p>
          )}
        </div>
      </div>
    </div>
  );
}