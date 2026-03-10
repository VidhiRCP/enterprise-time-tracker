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

  return { projects, entries, session, assignments };
}

export type ProjectAlias = {
  projectId: string;
  projectName: string;
  aliases: string;
};

export async function getInsightsData(email: string) {
  const lowerEmail = email.toLowerCase();

  // This week: Monday–Sunday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const user = await prisma.user.findUnique({ where: { email: lowerEmail } });
  if (!user) return { dailyBreakdown: [], totalMinutes: 0, projectTotals: [] };

  const [timeEntries, calAllocations] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        workDate: { gte: monday, lte: sunday },
      },
      include: { project: true },
    }),
    prisma.calendarAllocation.findMany({
      where: {
        userId: user.id,
        eventStart: { gte: monday, lte: sunday },
      },
      include: { project: true },
    }),
  ]);

  // Aggregate: date → project → { minutes, sources }
  const map = new Map<string, Map<string, { projectName: string; activityMin: number; meetingMin: number }>>();

  for (const entry of timeEntries) {
    const dateKey = entry.workDate.toISOString().slice(0, 10);
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    const dayMap = map.get(dateKey)!;
    const existing = dayMap.get(entry.projectId) ?? { projectName: entry.project.projectName, activityMin: 0, meetingMin: 0 };
    existing.activityMin += entry.durationMinutes;
    dayMap.set(entry.projectId, existing);
  }

  for (const alloc of calAllocations) {
    const dateKey = alloc.eventStart.toISOString().slice(0, 10);
    if (!map.has(dateKey)) map.set(dateKey, new Map());
    const dayMap = map.get(dateKey)!;
    const existing = dayMap.get(alloc.projectId) ?? { projectName: alloc.project.projectName, activityMin: 0, meetingMin: 0 };
    existing.meetingMin += alloc.durationMin;
    dayMap.set(alloc.projectId, existing);
  }

  // Build daily breakdown sorted by date
  const dailyBreakdown = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayMap]) => ({
      date,
      projects: Array.from(dayMap.entries())
        .map(([projectId, data]) => ({
          projectId,
          projectName: data.projectName,
          activityMin: data.activityMin,
          meetingMin: data.meetingMin,
          totalMin: data.activityMin + data.meetingMin,
        }))
        .sort((a, b) => b.totalMin - a.totalMin),
    }));

  // Project totals for the week
  const projectTotalsMap = new Map<string, { projectName: string; activityMin: number; meetingMin: number }>();
  for (const day of dailyBreakdown) {
    for (const p of day.projects) {
      const existing = projectTotalsMap.get(p.projectId) ?? { projectName: p.projectName, activityMin: 0, meetingMin: 0 };
      existing.activityMin += p.activityMin;
      existing.meetingMin += p.meetingMin;
      projectTotalsMap.set(p.projectId, existing);
    }
  }

  const projectTotals = Array.from(projectTotalsMap.entries())
    .map(([projectId, data]) => ({
      projectId,
      projectName: data.projectName,
      activityMin: data.activityMin,
      meetingMin: data.meetingMin,
      totalMin: data.activityMin + data.meetingMin,
    }))
    .sort((a, b) => b.totalMin - a.totalMin);

  const totalMinutes = projectTotals.reduce((sum, p) => sum + p.totalMin, 0);

  return { dailyBreakdown, totalMinutes, projectTotals };
}