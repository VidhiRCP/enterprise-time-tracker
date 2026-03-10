import { prisma } from "@/lib/prisma";

export type CalendarEvent = {
  id: string;
  subject: string;
  start: string;        // ISO datetime
  end: string;          // ISO datetime
  durationMinutes: number;
  isAllDay: boolean;
  attendees: string[];
  allocatedProjectId: string | null;
  suggestedProjectId: string | null;
  suggestedProjectName: string | null;
};

export type GroupedEvents = {
  date: string;         // yyyy-MM-dd
  events: CalendarEvent[];
};

/**
 * Fetch non-private calendar events from Microsoft Graph for the current week
 * (Monday to Friday). Falls back to empty array if the token is expired or missing.
 */
export async function getCalendarEvents(
  accessToken: string,
  email: string,
): Promise<GroupedEvents[]> {
  // Build a date range: Monday of this week → Sunday
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const startDateTime = monday.toISOString();
  const endDateTime = sunday.toISOString();

  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarview");
  url.searchParams.set("startdatetime", startDateTime);
  url.searchParams.set("enddatetime", endDateTime);
  url.searchParams.set(
    "$select",
    "id,subject,start,end,isAllDay,attendees,sensitivity",
  );
  url.searchParams.set("$orderby", "start/dateTime asc");
  url.searchParams.set("$top", "200");

  let graphEvents: any[] = [];
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Graph API error:", res.status, await res.text());
      return [];
    }
    const json = await res.json();
    graphEvents = json.value ?? [];
  } catch (err) {
    console.error("Failed to fetch calendar events:", err);
    return [];
  }

  // Filter out private events
  const publicEvents = graphEvents.filter(
    (e: any) => e.sensitivity !== "private" && e.sensitivity !== "confidential",
  );

  // Fetch existing allocations for this user
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  const allocations = user
    ? await prisma.calendarAllocation.findMany({
        where: { userId: user.id },
        select: { eventId: true, projectId: true },
      })
    : [];

  const allocationMap = new Map<string, string>(
    allocations.map((a: { eventId: string; projectId: string }) => [a.eventId, a.projectId]),
  );

  // Fetch project aliases for auto-suggest
  const assignments = user
    ? await prisma.projectAssignment.findMany({
        where: { userId: user.id, active: true },
        select: { projectId: true, aliases: true, project: { select: { projectName: true } } },
      })
    : [];

  // Build alias → project map (lowercase keywords)
  const aliasEntries: { keyword: string; projectId: string; projectName: string }[] = [];
  for (const a of assignments) {
    if (!a.aliases) continue;
    const keywords = a.aliases.split(",").map((k: string) => k.trim().toLowerCase()).filter(Boolean);
    for (const kw of keywords) {
      aliasEntries.push({ keyword: kw, projectId: a.projectId, projectName: a.project.projectName });
    }
  }

  function suggestProject(subject: string): { projectId: string; projectName: string } | null {
    const lower = subject.toLowerCase();
    // Try exact substring match first, longest keyword wins
    const sorted = [...aliasEntries].sort((a, b) => b.keyword.length - a.keyword.length);
    for (const entry of sorted) {
      if (lower.includes(entry.keyword)) {
        return { projectId: entry.projectId, projectName: entry.projectName };
      }
    }
    return null;
  }

  // Map to our CalendarEvent type
  const events: CalendarEvent[] = publicEvents.map((e: any) => {
    const startDt = new Date(e.start?.dateTime + "Z");
    const endDt = new Date(e.end?.dateTime + "Z");
    const durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);

    const attendees: string[] = (e.attendees ?? [])
      .map((a: any) => a.emailAddress?.name || a.emailAddress?.address || "")
      .filter(Boolean);

    const allocated = allocationMap.get(e.id);
    const suggestion = !allocated ? suggestProject(e.subject || "") : null;

    return {
      id: e.id as string,
      subject: (e.subject || "(No subject)") as string,
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      durationMinutes,
      isAllDay: (e.isAllDay ?? false) as boolean,
      attendees,
      allocatedProjectId: allocated ?? null,
      suggestedProjectId: suggestion?.projectId ?? null,
      suggestedProjectName: suggestion?.projectName ?? null,
    };
  });

  // Group by date
  const groups = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    const dateKey = event.start.slice(0, 10); // yyyy-MM-dd
    const arr = groups.get(dateKey) ?? [];
    arr.push(event);
    groups.set(dateKey, arr);
  }

  // Sort by date and return
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({ date, events }));
}
