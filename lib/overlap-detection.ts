/**
 * Overlap / double-session detection utility.
 *
 * Detects when a user has overlapping work activity — a time session and a
 * calendar meeting happening at the same time.
 *
 * Overlap rule:
 *   session.start < meeting.end  AND  session.end > meeting.start
 */

import { prisma } from "@/lib/prisma";

/* ── Types ── */

export type OverlapItem = {
  timeEntryId: string | null;
  timerSessionId: string | null;
  meetingId: string;
  overlapMinutes: number;
  timeRangeStart: string; // ISO
  timeRangeEnd: string;   // ISO
  meetingStart: string;    // ISO
  meetingEnd: string;      // ISO
  projectId: string;
  projectName: string;
  meetingTitle: string;
  meetingProjectId: string | null;
  meetingProjectName: string | null;
};

export type OverlapSuggestion = {
  type:
    | "keep_both"
    | "shorten_timer"
    | "split_time"
    | "ignore";
  label: string;
  reason: string;
  suggestedNewEndTime?: string;
  suggestedMeetingEntryMinutes?: number;
};

export type OverlapResult = {
  overlaps: (OverlapItem & { suggestions: OverlapSuggestion[] })[];
  totalOverlapMinutes: number;
  affectedDays: number;
};

/* ── Detection ── */

export async function detectOverlaps(
  email: string,
  rangeStartISO: string,
  rangeEndISO: string,
): Promise<OverlapResult> {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return { overlaps: [], totalOverlapMinutes: 0, affectedDays: 0 };

  const rangeStart = new Date(rangeStartISO);
  const rangeEnd = new Date(rangeEndISO);

  // Fetch time sessions (finalized and running/paused) with entries
  const [sessions, entries, allocations] = await Promise.all([
    prisma.timerSession.findMany({
      where: {
        userId: user.id,
        startedAt: { lte: rangeEnd },
        OR: [
          { stoppedAt: { gte: rangeStart } },
          { status: { in: ["RUNNING", "PAUSED"] } }, // active — no end yet
        ],
      },
      include: { project: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId: user.id,
        workDate: { gte: rangeStart, lte: rangeEnd },
        timerSessionId: null, // manual entries only (timer entries covered via session)
      },
      include: {
        project: true,
        timerSession: { select: { startedAt: true, stoppedAt: true } },
      },
    }),
    prisma.calendarAllocation.findMany({
      where: {
        userId: user.id,
        eventStart: { lte: rangeEnd },
        eventEnd: { gte: rangeStart },
      },
      include: { project: true },
    }),
  ]);

  const overlaps: OverlapResult["overlaps"] = [];
  const affectedDates = new Set<string>();

  // Build time ranges from sessions
  type TimeRange = {
    start: Date;
    end: Date;
    entryId: string | null;
    sessionId: string | null;
    projectId: string;
    projectName: string;
  };

  const timeRanges: TimeRange[] = [];

  for (const s of sessions) {
    const start = s.startedAt;
    const end = s.stoppedAt ?? new Date(); // active timer → use now
    timeRanges.push({
      start,
      end,
      entryId: null,
      sessionId: s.id,
      projectId: s.projectId,
      projectName: s.project.projectName,
    });
  }

  // Manual entries have workDate but no precise start/end — skip overlap for those
  // (they don't have wall-clock times)

  // Check each time range against each meeting allocation
  for (const tr of timeRanges) {
    for (const alloc of allocations) {
      const mStart = alloc.eventStart;
      const mEnd = alloc.eventEnd;

      // Overlap condition: tr.start < mEnd AND tr.end > mStart
      if (tr.start < mEnd && tr.end > mStart) {
        const overlapStart = new Date(Math.max(tr.start.getTime(), mStart.getTime()));
        const overlapEnd = new Date(Math.min(tr.end.getTime(), mEnd.getTime()));
        const overlapMinutes = Math.max(1, Math.round((overlapEnd.getTime() - overlapStart.getTime()) / 60_000));

        // Skip tiny overlaps (< 2 min)
        if (overlapMinutes < 2) continue;

        // Skip if timer and meeting are on the same project
        if (tr.projectId === alloc.projectId) continue;

        affectedDates.add(mStart.toISOString().slice(0, 10));

        const item: OverlapItem = {
          timeEntryId: tr.entryId,
          timerSessionId: tr.sessionId,
          meetingId: alloc.eventId,
          overlapMinutes,
          timeRangeStart: tr.start.toISOString(),
          timeRangeEnd: tr.end.toISOString(),
          meetingStart: mStart.toISOString(),
          meetingEnd: mEnd.toISOString(),
          projectId: tr.projectId,
          projectName: tr.projectName,
          meetingTitle: alloc.eventSubject,
          meetingProjectId: alloc.projectId,
          meetingProjectName: alloc.project.projectName,
        };

        const suggestions = generateSuggestions(item, tr.end > new Date());
        overlaps.push({ ...item, suggestions });
      }
    }
  }

  const totalOverlapMinutes = overlaps.reduce((s, o) => s + o.overlapMinutes, 0);

  return {
    overlaps: overlaps.sort((a, b) => a.meetingStart.localeCompare(b.meetingStart)),
    totalOverlapMinutes,
    affectedDays: affectedDates.size,
  };
}

/* ── Suggestion generation ── */

function generateSuggestions(
  overlap: OverlapItem,
  isActiveTimer: boolean,
): OverlapSuggestion[] {
  const suggestions: OverlapSuggestion[] = [];

  // 1. Keep both
  suggestions.push({
    type: "keep_both",
    label: "Keep both as-is",
    reason: "No changes — overlap is intentional (e.g. multitasking).",
  });

  // 2. Shorten timer to meeting start
  if (isActiveTimer) {
    suggestions.push({
      type: "shorten_timer",
      label: "Shorten timer to meeting start",
      reason: `Timer overlaps meeting "${overlap.meetingTitle}" by ${overlap.overlapMinutes} min. End the timer when the meeting started.`,
      suggestedNewEndTime: overlap.meetingStart,
      suggestedMeetingEntryMinutes: overlap.overlapMinutes,
    });
  }

  // 3. Split time
  if (overlap.overlapMinutes >= 15) {
    const half = Math.round(overlap.overlapMinutes / 2);
    suggestions.push({
      type: "split_time",
      label: "Split time between meeting and project",
      reason: `Allocate ${half} min to the meeting project and keep ${overlap.overlapMinutes - half} min on your timer project.`,
      suggestedMeetingEntryMinutes: half,
    });
  }

  // 4. Ignore
  suggestions.push({
    type: "ignore",
    label: "Ignore this overlap",
    reason: "Dismiss this overlap — don't warn again today.",
  });

  return suggestions;
}

/* ── Today-only convenience wrapper ── */

export async function detectTodayOverlaps(email: string): Promise<OverlapResult> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  return detectOverlaps(email, todayStart.toISOString(), todayEnd.toISOString());
}
