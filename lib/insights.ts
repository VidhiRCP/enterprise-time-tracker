"use server";

import { prisma } from "./prisma";
import { detectOverlaps } from "./overlap-detection";

export type WeeklyMetrics = {
  weekStart: string; // YYYY-MM-DD
  weekEnd: string;   // YYYY-MM-DD
  totalMinutes: number;
  totalActivityMinutes: number;
  totalMeetingMinutes: number;
  coveragePercent: number; // tracked / expected (5 × 8h)
  estimatedUntrackedMinutes: number;
  projectTotals: { projectId: string; projectName: string; minutes: number }[];
  meetingMinutes: number;
  meetingMinutesPrevWeek: number | null;
  zeroActivityDays: string[]; // dates
  lowActivityDays: { date: string; minutes: number }[]; // < 30 min
  inactiveProjects: { projectId: string; projectName: string }[];
  expenseSummary: { totalAmount: string; currency: string | null; count: number } | null;
  assignedProjectCount: number;
  activeDays: number;
  overlapTotalMinutes: number;
  overlapCount: number;
  overlapAffectedDays: number;
  prevWeekTotalMinutes: number | null;
};

// Simple in-memory cache (TTL 15 minutes). Suitable for dev and short-lived server runtimes.
const cache = new Map<string, { ts: number; metrics: WeeklyMetrics }>();
const TTL = 1000 * 60 * 15;

function dateOnlyISO(d: Date) {
  const t = new Date(d);
  t.setHours(0, 0, 0, 0);
  return t.toISOString().slice(0, 10);
}

export async function getWeeklyMetrics(email: string, weekStartISO: string): Promise<WeeklyMetrics> {
  const key = `${email}|${weekStartISO}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < TTL) return cached.metrics;

  const weekStart = new Date(weekStartISO);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const prevStart = new Date(weekStart);
  prevStart.setDate(weekStart.getDate() - 7);
  const prevEnd = new Date(prevStart);
  prevEnd.setDate(prevStart.getDate() + 6);

  const [user, timeEntries, calAllocs, expenses] = await Promise.all([
    prisma.user.findUnique({ where: { email: email.toLowerCase() } }),
    prisma.timeEntry.findMany({
      where: { user: { email: email.toLowerCase() }, workDate: { gte: weekStart, lte: weekEnd } },
      include: { project: true, timerSession: { select: { startedAt: true, stoppedAt: true } } },
    }),
    prisma.calendarAllocation.findMany({
      where: { user: { email: email.toLowerCase() }, eventStart: { gte: weekStart, lte: weekEnd } },
      include: { project: true },
    }),
    prisma.expenseEntry.findMany({
      where: { user: { email: email.toLowerCase() }, expenseDate: { gte: weekStart, lte: weekEnd } },
    }),
  ]);

  if (!user) throw new Error("User not found");

  // Project totals (activity minutes)
  const projMap = new Map<string, { projectName: string; minutes: number }>();
  for (const e of timeEntries) {
    let mins = e.durationMinutes;
    if (e.timerSession?.startedAt && e.timerSession?.stoppedAt) {
      const start = new Date(e.timerSession.startedAt);
      const stop = new Date(e.timerSession.stoppedAt);
      start.setSeconds(0, 0);
      stop.setSeconds(0, 0);
      mins = Math.max(1, Math.round((stop.getTime() - start.getTime()) / 60000));
    }
    const cur = projMap.get(e.projectId) ?? { projectName: e.project.projectName, minutes: 0 };
    cur.minutes += mins;
    projMap.set(e.projectId, cur);
  }

  // Add meeting minutes into project totals separately for reporting
  let meetingMinutes = 0;
  for (const a of calAllocs) {
    meetingMinutes += a.durationMin;
    const cur = projMap.get(a.projectId) ?? { projectName: a.project.projectName, minutes: 0 };
    cur.minutes += a.durationMin;
    projMap.set(a.projectId, cur);
  }

  const projectTotals = Array.from(projMap.entries()).map(([projectId, v]) => ({ projectId, projectName: v.projectName, minutes: v.minutes })).sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = projectTotals.reduce((s, p) => s + p.minutes, 0);

  // Previous week meeting minutes for comparison
  const prevAllocs = await prisma.calendarAllocation.findMany({ where: { userId: user.id, eventStart: { gte: prevStart, lte: prevEnd } } });
  const meetingMinutesPrevWeek = prevAllocs.reduce((s, a) => s + a.durationMin, 0);

  // Daily activity map
  const days: Map<string, number> = new Map();
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    days.set(dateOnlyISO(d), 0);
  }
  // Calculate per-day sums
  for (const e of timeEntries) {
    const d = (e.workDate instanceof Date) ? dateOnlyISO(e.workDate) : (new Date(e.workDate)).toISOString().slice(0,10);
    const mins = e.durationMinutes;
    days.set(d, (days.get(d) ?? 0) + mins);
  }
  for (const a of calAllocs) {
    const d = a.eventStart.toISOString().slice(0,10);
    days.set(d, (days.get(d) ?? 0) + a.durationMin);
  }

  const zeroActivityDays: string[] = [];
  const lowActivityDays: { date: string; minutes: number }[] = [];
  for (const [date, mins] of days.entries()) {
    if (!mins || mins === 0) zeroActivityDays.push(date);
    else if (mins < 30) lowActivityDays.push({ date, minutes: mins });
  }

  // Assigned projects for this user (active)
  const assignments = await prisma.projectAssignment.findMany({ where: { userId: user.id, active: true }, include: { project: true } });
  const activeProjectIds = new Set(projectTotals.map((p) => p.projectId));
  const inactiveProjects = assignments.filter((a) => !activeProjectIds.has(a.projectId)).map((a) => ({ projectId: a.projectId, projectName: a.project.projectName }));

  // Expense summary
  let expenseSummary = null;
  if (expenses.length > 0) {
    const total = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
    const currency = expenses[0]?.currency ?? null;
    expenseSummary = { totalAmount: String(total), currency, count: expenses.length };
  }

  // Activity-only minutes (excluding meetings)
  const totalActivityMinutes = timeEntries.reduce((s, e) => s + e.durationMinutes, 0);

  // Coverage: tracked / expected (5 weekdays × 8h = 2400 min)
  const expectedMinutes = 5 * 8 * 60;
  const coveragePercent = expectedMinutes > 0 ? Math.round((totalMinutes / expectedMinutes) * 100) : 0;
  const estimatedUntrackedMinutes = Math.max(0, expectedMinutes - totalMinutes);

  // Active days count
  const activeDays = 7 - zeroActivityDays.length;

  // Overlap detection for the week
  const overlapResult = await detectOverlaps(email, weekStart.toISOString(), weekEnd.toISOString());

  // Previous week total minutes for comparison
  const prevTimeEntries = await prisma.timeEntry.findMany({
    where: { userId: user.id, workDate: { gte: prevStart, lte: prevEnd } },
  });
  const prevWeekActivityMin = prevTimeEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const prevWeekTotalMinutes = prevWeekActivityMin + meetingMinutesPrevWeek;

  const metrics: WeeklyMetrics = {
    weekStart: dateOnlyISO(weekStart),
    weekEnd: dateOnlyISO(weekEnd),
    totalMinutes,
    totalActivityMinutes,
    totalMeetingMinutes: meetingMinutes,
    coveragePercent,
    estimatedUntrackedMinutes,
    projectTotals,
    meetingMinutes,
    meetingMinutesPrevWeek: typeof meetingMinutesPrevWeek === 'number' ? meetingMinutesPrevWeek : null,
    zeroActivityDays,
    lowActivityDays,
    inactiveProjects,
    expenseSummary,
    assignedProjectCount: assignments.length,
    activeDays,
    overlapTotalMinutes: overlapResult.totalOverlapMinutes,
    overlapCount: overlapResult.overlaps.length,
    overlapAffectedDays: overlapResult.affectedDays,
    prevWeekTotalMinutes,
  };

  cache.set(key, { ts: Date.now(), metrics });
  return metrics;
}
