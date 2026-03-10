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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, tick]);

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
    <div className="space-y-3 sm:space-y-4">
      <div>
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-[#808080]">Current timer</div>
        <div className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
          {formatSeconds(elapsedSeconds)}
        </div>
        <div className="mt-1 sm:mt-2 text-xs sm:text-sm text-[#D9D9D9]">
          {session ? (
            <span>
              <span className={session.status === "RUNNING" ? "text-[#F40000]" : "text-[#808080]"}>●</span>
              {" "}{session.status === "RUNNING" ? "Running" : "Paused"}
            </span>
          ) : "No active timer"}
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs sm:text-sm font-medium text-[#D9D9D9]">Project</label>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm focus:border-[#F40000] focus:outline-none"
        >
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs sm:text-sm font-medium text-[#D9D9D9]">Notes</label>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm focus:border-[#F40000] focus:outline-none"
          placeholder="What are you working on?"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          disabled={isPending || !projectId}
          onClick={() =>
            startTransition(async () => {
              // Optimistic: show running state immediately
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

              const result = await createOrResumeSession({
                projectId,
                notes: notesDraft,
              });

              // Sync with server result
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
          {session?.status === "PAUSED" ? "Resume" : session ? "Running" : "Start"}
        </button>

        <button
          disabled={isPending || !session || session.status === "PAUSED"}
          onClick={() =>
            startTransition(async () => {
              // Optimistic: pause immediately
              setSession({
                ...session!,
                accumulatedSeconds: elapsedSeconds,
                status: "PAUSED",
                lastResumedAt: null,
                notesDraft,
              });

              await pauseSession({
                sessionId: session!.id,
                elapsedSeconds,
                notesDraft,
              });
            })
          }
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-medium text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors disabled:opacity-40"
        >
          Pause
        </button>

        <button
          disabled={isPending || !session}
          onClick={() =>
            startTransition(async () => {
              const sid = session!.id;
              // Optimistic: clear timer immediately
              setSession(null);
              setNotesDraft("");

              await finalizeSession({
                sessionId: sid,
                projectId,
                elapsedSeconds,
                notesDraft,
                workDate: localDateInputValue(),
              });
            })
          }
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
        >
          Save tracked time
        </button>

        <button
          disabled={isPending || !session}
          onClick={() =>
            startTransition(async () => {
              const sid = session!.id;
              // Optimistic: clear timer immediately
              setSession(null);
              setNotesDraft("");

              await discardSession({
                sessionId: sid,
                elapsedSeconds,
                notesDraft,
              });
            })
          }
          className="rounded-xl border border-[#808080]/30 px-3 py-2 text-xs sm:text-sm font-medium text-[#F40000] hover:opacity-80 transition-opacity disabled:opacity-40"
        >
          Discard session
        </button>
      </div>
    </div>
  );
}