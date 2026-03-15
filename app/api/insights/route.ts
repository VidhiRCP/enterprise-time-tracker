import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function POST(req: Request) {
  const session = await requireUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const weekStartISO = body?.weekStart;

  const email = session.user.email!.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ entries: [], allocations: [], currentWeekISO: null });

  let start: Date;
  if (weekStartISO) {
    start = new Date(weekStartISO);
    start.setHours(0, 0, 0, 0);
  } else {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start = new Date(now);
    start.setDate(now.getDate() + mondayOffset);
    start.setHours(0, 0, 0, 0);
  }

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const [timeEntries, calAllocations] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        workDate: { gte: start, lte: end },
      },
      include: { project: true, timerSession: { select: { startedAt: true, stoppedAt: true } } },
    }),
    prisma.calendarAllocation.findMany({
      where: {
        userId: user.id,
        eventStart: { gte: start, lte: end },
      },
      include: { project: true },
    }),
  ]);

  const entries = timeEntries.map((e) => ({
    projectId: e.projectId,
    projectName: e.project.projectName,
    workDate: e.workDate.toISOString().slice(0, 10),
    durationMinutes: e.durationMinutes,
    startedAt: e.timerSession?.startedAt?.toISOString() ?? null,
    stoppedAt: e.timerSession?.stoppedAt?.toISOString() ?? null,
  }));

  const allocations = calAllocations.map((a) => ({
    projectId: a.projectId,
    projectName: a.project.projectName,
    eventDate: a.eventStart.toISOString().slice(0, 10),
    durationMin: a.durationMin,
  }));

  return NextResponse.json({ entries, allocations, currentWeekISO: start.toISOString() });
}
