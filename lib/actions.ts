"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureProjectAccess } from "@/lib/authz";
import { captureSignal } from "@/lib/work-patterns";

async function requireEmail() {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Unauthorized");
  return session.user.email.toLowerCase();
}

export async function createManualEntry(input: {
  projectId: string;
  workDate: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  notes: string;
}): Promise<{ error?: string }> {
  const email = await requireEmail();

  if (!input.projectId) return { error: "Please select a project." };
  if (!input.workDate) return { error: "Please select a date." };
  // Only allow today's date
  const today = new Date().toISOString().slice(0, 10);
  if (input.workDate !== today) return { error: "Manual entries can only be created for today." };
  // Notes are optional

  let durationMinutes = input.durationMinutes ?? 0;

  // If start/end times provided, calculate duration from them
  if (input.startTime && input.endTime) {
    const [sh, sm] = input.startTime.split(":").map(Number);
    const [eh, em] = input.endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return { error: "End time must be after start time." };
    durationMinutes = endMin - startMin;
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "Duration must be at least 1 minute." };
  }

  await ensureProjectAccess(email, input.projectId);

  await prisma.timeEntry.create({
    data: {
      user: { connect: { email } },
      project: { connect: { projectId: input.projectId } },
      workDate: new Date(`${input.workDate}T00:00:00.000Z`),
      durationMinutes,
      notes: input.notes?.trim() || null,
      source: "MANUAL",
      status: "SAVED",
    },
  });

  // Learn from confirmed save — capture note keywords → project association
  if (input.notes?.trim()) {
    captureSignal(email, "note", input.notes, input.projectId).catch(() => {});
  }

  revalidatePath("/");
  return {};
}

export async function createOrResumeSession(input: {
  projectId: string;
  notes?: string;
}) {
  const email = await requireEmail();
  await ensureProjectAccess(email, input.projectId);

  const existing = await prisma.timerSession.findFirst({
    where: {
      user: { email },
      status: { in: ["RUNNING", "PAUSED"] },
    },
    orderBy: { updatedAt: "desc" },
  });

  const result = existing
    ? await prisma.timerSession.update({
        where: { id: existing.id },
        data: {
          projectId: input.projectId,
          notesDraft: input.notes?.trim() || null,
          status: "RUNNING",
          lastResumedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      })
    : await prisma.timerSession.create({
        data: {
          user: { connect: { email } },
          project: { connect: { projectId: input.projectId } },
          status: "RUNNING",
          startedAt: new Date(),
          lastResumedAt: new Date(),
          lastHeartbeatAt: new Date(),
          accumulatedSeconds: 0,
          notesDraft: input.notes?.trim() || null,
        },
      });

  revalidatePath("/");
  return result;
}

export async function pauseSession(input: {
  sessionId: string;
  elapsedSeconds: number;
  notesDraft?: string;
}) {
  const email = await requireEmail();

  await prisma.timerSession.updateMany({
    where: { id: input.sessionId, user: { email } },
    data: {
      status: "PAUSED",
      accumulatedSeconds: Math.max(0, input.elapsedSeconds),
      notesDraft: input.notesDraft?.trim() || null,
      lastHeartbeatAt: new Date(),
      pausedAt: new Date(),
    },
  });

  revalidatePath("/");
}

export async function heartbeatSession(input: {
  sessionId: string;
  projectId: string;
  notesDraft?: string;
  elapsedSeconds: number;
}) {
  const email = await requireEmail();
  await ensureProjectAccess(email, input.projectId);

  await prisma.timerSession.updateMany({
    where: { id: input.sessionId, user: { email } },
    data: {
      projectId: input.projectId,
      notesDraft: input.notesDraft?.trim() || null,
      accumulatedSeconds: Math.max(0, input.elapsedSeconds),
      lastHeartbeatAt: new Date(),
    },
  });
}

export async function finalizeSession(input: {
  sessionId: string;
  projectId: string;
  elapsedSeconds: number;
  notesDraft?: string;
  workDate: string;
}) {
  const email = await requireEmail();
  await ensureProjectAccess(email, input.projectId);

  const session = await prisma.timerSession.findFirst({
    where: { id: input.sessionId, user: { email } },
  });

  if (!session) throw new Error("Session not found.");

  // Notes are optional when finalizing a session

  const now = new Date();
  const wallClockMs = now.getTime() - session.startedAt.getTime();
  const durationMinutes = Math.max(1, Math.round(wallClockMs / 60_000));

  await prisma.$transaction([
    prisma.timeEntry.create({
      data: {
        user: { connect: { email } },
        project: { connect: { projectId: input.projectId } },
        timerSession: { connect: { id: session.id } },
        workDate: new Date(`${input.workDate}T00:00:00.000Z`),
        durationMinutes,
        notes: input.notesDraft?.trim() || null,
        source: "TIMER",
        status: "SAVED",
      },
    }),
    prisma.timerSession.update({
      where: { id: session.id },
      data: {
        status: "FINALIZED",
        accumulatedSeconds: Math.max(0, input.elapsedSeconds),
        notesDraft: input.notesDraft?.trim() || null,
        stoppedAt: now,
        finalizedAt: now,
        lastHeartbeatAt: now,
      },
    }),
  ]);

  // Learn from confirmed save — capture note keywords → project association
  if (input.notesDraft?.trim()) {
    captureSignal(email, "note", input.notesDraft, input.projectId).catch(() => {});
  }

  revalidatePath("/");
}

export async function discardSession(input: {
  sessionId: string;
  elapsedSeconds: number;
  notesDraft?: string;
}) {
  const email = await requireEmail();

  await prisma.timerSession.updateMany({
    where: { id: input.sessionId, user: { email } },
    data: {
      status: "ABANDONED",
      accumulatedSeconds: Math.max(0, input.elapsedSeconds),
      notesDraft: input.notesDraft?.trim() || null,
      stoppedAt: new Date(),
      lastHeartbeatAt: new Date(),
    },
  });

  revalidatePath("/");
}

export async function deleteTimeEntry(entryId: string) {
  const email = await requireEmail();

  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId, user: { email } },
  });

  if (!entry) throw new Error("Entry not found or not yours.");

  await prisma.timeEntry.delete({ where: { id: entryId } });

  revalidatePath("/");
}

export async function updateManualEntry(input: {
  entryId: string;
  projectId: string;
  workDate: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  notes: string;
}): Promise<{ error?: string }> {
  const email = await requireEmail();

  const entry = await prisma.timeEntry.findFirst({
    where: { id: input.entryId, user: { email }, source: "MANUAL" },
  });

  if (!entry) return { error: "Entry not found or not editable." };
  if (!input.projectId) return { error: "Please select a project." };
  if (!input.workDate) return { error: "Please select a date." };
  // Notes optional for manual entry updates

  let durationMinutes = input.durationMinutes ?? 0;

  if (input.startTime && input.endTime) {
    const [sh, sm] = input.startTime.split(":").map(Number);
    const [eh, em] = input.endTime.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin <= startMin) return { error: "End time must be after start time." };
    durationMinutes = endMin - startMin;
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return { error: "Duration must be at least 1 minute." };
  }

  await ensureProjectAccess(email, input.projectId);

  await prisma.timeEntry.update({
    where: { id: input.entryId },
    data: {
      projectId: input.projectId,
      workDate: new Date(`${input.workDate}T00:00:00.000Z`),
      durationMinutes,
      notes: input.notes?.trim() || null,
    },
  });

  revalidatePath("/");
  return {};
}

export async function allocateCalendarEvent(input: {
  eventId: string;
  eventSubject: string;
  eventStart: string;
  eventEnd: string;
  durationMin: number;
  projectId: string | null; // null = deallocate
}) {
  const email = await requireEmail();

  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
  });

  // If projectId is null, remove the allocation
  if (!input.projectId) {
    await prisma.calendarAllocation.deleteMany({
      where: { userId: user.id, eventId: input.eventId },
    });
    revalidatePath("/");
    return;
  }

  await ensureProjectAccess(email, input.projectId);

  await prisma.calendarAllocation.upsert({
    where: {
      userId_eventId: { userId: user.id, eventId: input.eventId },
    },
    update: {
      projectId: input.projectId,
      eventSubject: input.eventSubject,
      eventStart: new Date(input.eventStart),
      eventEnd: new Date(input.eventEnd),
      durationMin: input.durationMin,
    },
    create: {
      userId: user.id,
      projectId: input.projectId,
      eventId: input.eventId,
      eventSubject: input.eventSubject,
      eventStart: new Date(input.eventStart),
      eventEnd: new Date(input.eventEnd),
      durationMin: input.durationMin,
    },
  });

  // Learn from confirmed allocation — capture meeting subject → project association
  if (input.eventSubject?.trim()) {
    captureSignal(email, "meeting", input.eventSubject, input.projectId).catch(() => {});
  }

  revalidatePath("/");
}

export async function updateProjectAliases(input: {
  projectId: string;
  aliases: string;
}) {
  const email = await requireEmail();
  await ensureProjectAccess(email, input.projectId);

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });

  await prisma.projectAssignment.updateMany({
    where: { userId: user.id, projectId: input.projectId },
    data: { aliases: input.aliases.trim() || null },
  });

  revalidatePath("/");
}