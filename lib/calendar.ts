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
      next: { revalidate: 0 },
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

  // Map to our CalendarEvent type
  const events: CalendarEvent[] = publicEvents.map((e: any) => {
    const startDt = new Date(e.start?.dateTime + "Z");
    const endDt = new Date(e.end?.dateTime + "Z");
    const durationMinutes = Math.round((endDt.getTime() - startDt.getTime()) / 60000);

    const attendees: string[] = (e.attendees ?? [])
      .map((a: any) => a.emailAddress?.name || a.emailAddress?.address || "")
      .filter(Boolean);

    const allocated = allocationMap.get(e.id);

    return {
      id: e.id as string,
      subject: (e.subject || "(No subject)") as string,
      start: startDt.toISOString(),
      end: endDt.toISOString(),
      durationMinutes,
      isAllDay: (e.isAllDay ?? false) as boolean,
      attendees,
      allocatedProjectId: allocated ?? null,
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
