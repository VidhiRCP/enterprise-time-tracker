"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ensureProjectAccess } from "@/lib/authz";

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
  if (!input.notes.trim()) return { error: "Notes are required." };

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
      notes: input.notes.trim(),
      source: "MANUAL",
      status: "SAVED",
    },
  });

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

  if (existing) {
    return prisma.timerSession.update({
      where: { id: existing.id },
      data: {
        projectId: input.projectId,
        notesDraft: input.notes?.trim() || null,
        status: "RUNNING",
        lastResumedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    });
  }

  return prisma.timerSession.create({
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

  if (!input.notesDraft?.trim()) throw new Error("Notes are required before saving.");

  const durationMinutes = Math.max(1, Math.round(input.elapsedSeconds / 60));

  await prisma.$transaction([
    prisma.timeEntry.create({
      data: {
        user: { connect: { email } },
        project: { connect: { projectId: input.projectId } },
        timerSession: { connect: { id: session.id } },
        workDate: new Date(`${input.workDate}T00:00:00.000Z`),
        durationMinutes,
        notes: input.notesDraft.trim(),
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
        stoppedAt: new Date(),
        finalizedAt: new Date(),
        lastHeartbeatAt: new Date(),
      },
    }),
  ]);

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
  if (!input.notes.trim()) return { error: "Notes are required." };

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
      notes: input.notes.trim(),
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