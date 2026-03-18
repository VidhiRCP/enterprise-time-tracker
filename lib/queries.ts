import { prisma } from "@/lib/prisma";

export async function getDashboardData(email: string) {
  const [projects, entries, session, assignments] = await Promise.all([
    prisma.project.findMany({
      where: {
        active: true,
        assignments: {
          some: {
            active: true,
            user: { email: email.toLowerCase() },
          },
        },
      },
      orderBy: { projectName: "asc" },
    }),
    prisma.timeEntry.findMany({
      where: {
        user: { email: email.toLowerCase() },
      },
      include: {
        project: true,
        timerSession: {
          select: {
            startedAt: true,
            stoppedAt: true,
          },
        },
      },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    prisma.timerSession.findFirst({
      where: {
        user: { email: email.toLowerCase() },
        status: { in: ["RUNNING", "PAUSED"] },
      },
      include: { project: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.projectAssignment.findMany({
      where: {
        active: true,
        user: { email: email.toLowerCase() },
      },
      select: {
        projectId: true,
        aliases: true,
        project: { select: { projectName: true } },
      },
    }),
  ]);

  // Fetch learned work patterns for suggestion scoring
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const workPatterns = user
    ? await prisma.userWorkPattern.findMany({
        where: { userId: user.id },
        select: {
          signalType: true,
          signalValue: true,
          projectId: true,
          confidenceScore: true,
          count: true,
        },
        orderBy: { confidenceScore: "desc" },
      })
    : [];

  return { projects, entries, session, assignments, workPatterns };
}

export type ProjectAlias = {
  projectId: string;
  projectName: string;
  aliases: string;
};

export async function getInsightsData(email: string) {
  const lowerEmail = email.toLowerCase();

  // Fetch last 8 weeks of data for week navigation
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const currentMonday = new Date(now);
  currentMonday.setDate(now.getDate() + mondayOffset);
  currentMonday.setHours(0, 0, 0, 0);

  // Go back 7 more weeks
  const rangeStart = new Date(currentMonday);
  rangeStart.setDate(rangeStart.getDate() - 7 * 7);

  const currentSunday = new Date(currentMonday);
  currentSunday.setDate(currentMonday.getDate() + 6);
  currentSunday.setHours(23, 59, 59, 999);

  const user = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (!user) return { entries: [], allocations: [], currentWeekISO: currentMonday.toISOString() };

  const [timeEntries, calAllocations] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        workDate: { gte: rangeStart, lte: currentSunday },
      },
      include: {
        project: true,
        timerSession: {
          select: { startedAt: true, stoppedAt: true },
        },
      },
    }),
    prisma.calendarAllocation.findMany({
      where: {
        userId: user.id,
        eventStart: { gte: rangeStart, lte: currentSunday },
      },
      include: { project: true },
    }),
  ]);

  // Return raw data — let client aggregate per selected week
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

  return { entries, allocations, currentWeekISO: currentMonday.toISOString() };
}