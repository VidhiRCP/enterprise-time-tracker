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
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!session) return 0;
    if (session.status === "PAUSED") return session.accumulatedSeconds;

    const last = session.lastResumedAt
      ? new Date(session.lastResumedAt).getTime()
      : Date.now();

    return session.accumulatedSeconds + Math.floor((Date.now() - last) / 1000);
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const id = window.setInterval(() => {
      const currentElapsed =
        session.status === "PAUSED"
          ? session.accumulatedSeconds
          : session.accumulatedSeconds +
            Math.floor(
              (Date.now() -
                new Date(session.lastResumedAt ?? Date.now()).getTime()) /
                1000
            );

      heartbeatSession({
        sessionId: session.id,
        projectId,
        notesDraft,
        elapsedSeconds: currentElapsed,
      }).catch(console.error);
    }, 10000);

    return () => window.clearInterval(id);
  }, [session, projectId, notesDraft]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!session) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [session]);

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-slate-500">Current timer</div>
        <div className="mt-2 text-5xl font-semibold tracking-tight">
          {formatSeconds(elapsedSeconds)}
        </div>
        <div className="mt-2 text-sm text-slate-600">
          {session ? `${session.status} session` : "No active timer"}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Project</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
        >
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Notes</label>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
          placeholder="What are you working on?"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          disabled={isPending || !projectId}
          onClick={() =>
            startTransition(async () => {
              const result = await createOrResumeSession({
                projectId,
                notes: notesDraft,
              });

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
          className="rounded-2xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {session?.status === "PAUSED" ? "Resume" : session ? "Running" : "Start"}
        </button>

        <button
          disabled={isPending || !session || session.status === "PAUSED"}
          onClick={() =>
            startTransition(async () => {
              await pauseSession({
                sessionId: session!.id,
                elapsedSeconds,
                notesDraft,
              });

              setSession({
                ...session!,
                accumulatedSeconds: elapsedSeconds,
                status: "PAUSED",
                lastResumedAt: null,
                notesDraft,
              });
            })
          }
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
        >
          Pause
        </button>

        <button
          disabled={isPending || !session}
          onClick={() =>
            startTransition(async () => {
              await finalizeSession({
                sessionId: session!.id,
                projectId,
                elapsedSeconds,
                notesDraft,
                workDate: localDateInputValue(),
              });

              setSession(null);
              setNotesDraft("");
            })
          }
          className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
        >
          Save tracked time
        </button>

        <button
          disabled={isPending || !session}
          onClick={() =>
            startTransition(async () => {
              await discardSession({
                sessionId: session!.id,
                elapsedSeconds,
                notesDraft,
              });

              setSession(null);
              setNotesDraft("");
            })
          }
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
        >
          Discard session
        </button>
      </div>
    </div>
  );
}