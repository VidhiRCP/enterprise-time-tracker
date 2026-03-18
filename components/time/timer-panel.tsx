"use client";

import { useEffect, useMemo, useState, useTransition, useCallback } from "react";
import {
  createOrResumeSession,
  pauseSession,
  heartbeatSession,
  finalizeSession,
  discardSession,
} from "@/lib/actions";
import { formatSeconds, localDateInputValue } from "@/lib/time";
import {
  broadcastTimerState,
  onTimerCommand,
  type TimerState,
} from "@/lib/timer-broadcast";
import {
  useProjectSuggestion,
  type SuggestionAssignment,
  type SuggestionEntry,
} from "@/lib/hooks/use-project-suggestion";
import { ProjectSuggestion } from "@/components/time/project-suggestion";

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
  assignments,
  recentEntries,
}: {
  projects: ProjectOption[];
  activeSession: SessionData | null;
  assignments: SuggestionAssignment[];
  recentEntries: SuggestionEntry[];
}) {
  const [projectId, setProjectId] = useState(activeSession?.projectId ?? projects[0]?.projectId ?? "");
  const [notesDraft, setNotesDraft] = useState(activeSession?.notesDraft ?? "");
  const [session, setSession] = useState<SessionData | null>(activeSession);
  const [isPending, startTransition] = useTransition();
  const [tick, setTick] = useState(0);
  const [lastAutosaved, setLastAutosaved] = useState<Date | null>(null);
  const [notesError, setNotesError] = useState("");

  // Project auto-suggestion
  const { suggestion, dismiss: dismissSuggestion, resetDismiss } = useProjectSuggestion({
    notes: notesDraft,
    assignments,
    recentEntries,
    currentProjectId: projectId,
    enabled: !session, // only suggest when no active session
  });

  // Tick every second for live timer
  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Listen for commands
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

  /* ── Broadcast timer state to popup window ── */
  const buildBroadcastState = useCallback((): TimerState => ({
    sessionId: session?.id ?? null,
    projectId,
    projectName: selectedProject?.projectName ?? "—",
    status: session ? session.status : "IDLE",
    accumulatedSeconds: session?.accumulatedSeconds ?? 0,
    lastResumedAt: session?.lastResumedAt ?? null,
    notesDraft,
    projects,
  }), [session, projectId, selectedProject, notesDraft, projects]);

  // Broadcast on every meaningful state change
  useEffect(() => {
    broadcastTimerState(buildBroadcastState());
  }, [buildBroadcastState]);

  // Listen for commands from popup
  useEffect(() => {
    const unsub = onTimerCommand((cmd) => {
      switch (cmd.type) {
        case "requestState":
          broadcastTimerState(buildBroadcastState());
          break;
        case "start":
          if (!session || session.status === "PAUSED") {
            // trigger start/resume
            const pid = cmd.projectId || projectId;
            setProjectId(pid);
            const now = new Date().toISOString();
            setSession((s) => ({
              id: s?.id ?? "_pending",
              projectId: pid,
              notesDraft: cmd.notes ?? notesDraft,
              accumulatedSeconds: s?.accumulatedSeconds ?? 0,
              status: "RUNNING",
              startedAt: s?.startedAt ?? now,
              lastResumedAt: now,
            }));
            startTransition(async () => {
              try {
                const result = await createOrResumeSession({ projectId: pid, notes: cmd.notes ?? notesDraft });
                setSession({
                  id: result.id,
                  projectId: result.projectId,
                  notesDraft: result.notesDraft,
                  accumulatedSeconds: result.accumulatedSeconds,
                  status: result.status as "RUNNING" | "PAUSED",
                  startedAt: result.startedAt.toISOString(),
                  lastResumedAt: result.lastResumedAt?.toISOString() ?? null,
                });
              } catch {}
            });
          }
          break;
        case "pause":
          if (session?.status === "RUNNING") {
            const frozenElapsed = elapsedSeconds;
            setSession({ ...session, accumulatedSeconds: frozenElapsed, status: "PAUSED", lastResumedAt: null, notesDraft });
            startTransition(async () => {
              try {
                await pauseSession({ sessionId: session.id, elapsedSeconds: frozenElapsed, notesDraft });
              } catch {}
            });
          }
          break;
        case "resume":
          if (session?.status === "PAUSED") {
            const now = new Date().toISOString();
            setSession({ ...session, status: "RUNNING", lastResumedAt: now });
            startTransition(async () => {
              try {
                await createOrResumeSession({ projectId, notes: notesDraft });
              } catch {}
            });
          }
          break;
        case "save":
          if (session) {
            const sid = session.id;
            const frozenElapsed = elapsedSeconds;
            const frozenNotes = notesDraft;
            setSession(null);
            setNotesDraft("");
            setLastAutosaved(null);
            startTransition(async () => {
              try {
                await finalizeSession({ sessionId: sid, projectId, elapsedSeconds: frozenElapsed, notesDraft: frozenNotes, workDate: localDateInputValue() });
              } catch {}
            });
          }
          break;
        case "discard":
          if (session) {
            const sid = session.id;
            const frozenElapsed = elapsedSeconds;
            const frozenNotes = notesDraft;
            setSession(null);
            setNotesDraft("");
            setLastAutosaved(null);
            startTransition(async () => {
              try {
                await discardSession({ sessionId: sid, elapsedSeconds: frozenElapsed, notesDraft: frozenNotes });
              } catch {}
            });
          }
          break;
      }
    });
    return unsub;
  }, [buildBroadcastState, session, projectId, notesDraft, elapsedSeconds]);

  function handleProjectChange(newProjectId: string) {
    if (isRunning && newProjectId !== projectId) {
      if (!confirm("Timer is running. Switch project? The timer will continue.")) return;
    }
    setProjectId(newProjectId);
  }

  function validateNotes(): boolean {
    // Notes are optional across the app
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
          <div className="text-sm sm:text-base font-bold">Current timer</div>
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
            className="btn btn-md btn-primary"
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
            className="btn btn-md btn-ghost"
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
            className="btn btn-md btn-ghost"
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
            className="btn btn-md"
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
            className="w-full border border-[#808080]/30 bg-black px-2.5 py-1.5 text-sm focus:border-[#F40000] focus:outline-none app-input"
          >
            {projects.map((project) => (
              <option key={project.projectId} value={project.projectId}>
                {project.projectName} ({project.projectId})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Notes</label>
          <textarea
            value={notesDraft}
            onChange={(e) => { setNotesDraft(e.target.value); setNotesError(""); resetDismiss(); }}
            rows={2}
            className={`w-full border bg-black px-2.5 py-1.5 text-sm focus:border-[#F40000] focus:outline-none app-input ${
              notesError ? "border-[#F40000]" : "border-[#808080]/30"
            }`}
            placeholder="What are you working on?"
          />
          {notesError && (
            <p className="text-xs text-[#F40000]">{notesError}</p>
          )}
        </div>
      </div>

      {/* ── Project auto-suggestion ── */}
      <ProjectSuggestion
        suggestion={suggestion}
        onAccept={(pid) => {
          setProjectId(pid);
          dismissSuggestion();
        }}
        onDismiss={dismissSuggestion}
      />
    </div>
  );
}