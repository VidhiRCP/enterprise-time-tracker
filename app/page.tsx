import { auth, signOut } from "@/auth";
import { getDashboardData, getInsightsData } from "@/lib/queries";
import { getCalendarEvents } from "@/lib/calendar";
import { Card } from "@/components/ui/card";
import { SignInCard } from "@/components/sign-in-card";
import { TimesheetPanel } from "@/components/time/timesheet-panel";
import { InsightsPanel } from "@/components/time/insights-panel";
import { ProjectAliases } from "@/components/time/project-aliases";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { ActivityContent } from "@/components/time/activity-content";
import type { DashboardStatsData } from "@/components/time/dashboard-stats";

/* ── Compute all dashboard metrics server-side ── */
function computeDashboardStats(
  data: Awaited<ReturnType<typeof getDashboardData>>,
): DashboardStatsData {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Today's entries
  const todayEntries = data.entries.filter(
    (e) => new Date(e.workDate).toISOString().slice(0, 10) === todayStr,
  );
  const todayMinutes = todayEntries.reduce((s, e) => s + e.durationMinutes, 0);
  const todayProjects = new Set(todayEntries.map((e) => e.projectId));

  // Top project today
  const projMap = new Map<string, { projectName: string; projectId: string; minutes: number; sessions: number }>();
  for (const e of todayEntries) {
    const existing = projMap.get(e.projectId) ?? { projectName: e.project.projectName, projectId: e.project.projectId, minutes: 0, sessions: 0 };
    existing.minutes += e.durationMinutes;
    existing.sessions += 1;
    projMap.set(e.projectId, existing);
  }
  const topProjectToday = Array.from(projMap.values()).sort((a, b) => b.minutes - a.minutes)[0] ?? null;

  // Last activity ago
  let lastActivityAgo: string | null = null;
  if (todayEntries.length > 0) {
    const latest = todayEntries.reduce((max, e) => {
      const t = new Date(e.updatedAt ?? e.createdAt).getTime();
      return t > max ? t : max;
    }, 0);
    const diffMin = Math.round((now.getTime() - latest) / 60000);
    if (diffMin < 1) lastActivityAgo = "just now";
    else if (diffMin < 60) lastActivityAgo = `${diffMin} min ago`;
    else lastActivityAgo = `${Math.round(diffMin / 60)}h ago`;
  }

  // Week calculation (Mon–Sun)
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekDays = dayLabels.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const minutes = data.entries
      .filter((e) => new Date(e.workDate).toISOString().slice(0, 10) === dateStr)
      .reduce((s, e) => s + e.durationMinutes, 0);
    return { label, minutes };
  });
  const weekTotalMinutes = weekDays.reduce((s, d) => s + d.minutes, 0);

  // Active timer info
  const activeTimer = data.session
    ? {
        projectName: data.session.project.projectName,
        projectId: data.session.projectId,
        status: data.session.status as "RUNNING" | "PAUSED",
      }
    : null;

  // Recent entries (last 5)
  const recentEntries = data.entries.slice(0, 5).map((e) => ({
    projectName: e.project.projectName,
    projectId: e.project.projectId,
    durationMinutes: e.durationMinutes,
    source: e.source,
  }));

  // Stale projects (assigned but no entry in last 3 days)
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3);
  threeDaysAgo.setHours(0, 0, 0, 0);
  const lastEntryPerProject = new Map<string, Date>();
  for (const e of data.entries) {
    const d = new Date(e.workDate);
    const prev = lastEntryPerProject.get(e.projectId);
    if (!prev || d > prev) lastEntryPerProject.set(e.projectId, d);
  }
  const staleProjects = data.projects
    .map((p) => {
      const last = lastEntryPerProject.get(p.projectId);
      if (!last || last < threeDaysAgo) {
        const daysSince = last ? Math.round((now.getTime() - last.getTime()) / 86400000) : 999;
        return { projectId: p.projectId, projectName: p.projectName, daysSince };
      }
      return null;
    })
    .filter(Boolean) as { projectId: string; projectName: string; daysSince: number }[];

  return {
    todayMinutes,
    todayProjectsCount: todayProjects.size,
    activeTimer,
    weekTotalMinutes,
    weekStartISO: monday.toISOString(),
    weekEndISO: sunday.toISOString(),
    expectedDayHours: 8,
    topProjectToday,
    weekDays,
    recentEntries,
    staleProjects,
    lastActivityAgo,
  };
}

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <main className="min-h-screen p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-3xl pt-8 sm:pt-12 md:pt-16">
          <SignInCard />
        </div>
      </main>
    );
  }

  const data = await getDashboardData(session.user.email);
  const insightsData = await getInsightsData(session.user.email);
  const hasProjects = data.projects.length > 0;

  const accessToken = (session as any).accessToken as string | undefined;
  const calendarGroups = accessToken
    ? await getCalendarEvents(accessToken, session.user.email)
    : [];

  const projectOptions = data.projects.map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
  }));

  const aliasEntries = data.assignments.map((a) => ({
    projectId: a.projectId,
    projectName: a.project.projectName,
    aliases: a.aliases ?? "",
  }));

  const statsData = computeDashboardStats(data);
  const entryDateStrings = [...new Set(
    data.entries.map((e) => new Date(e.workDate).toISOString().slice(0, 10)),
  )];

  return (
    <main className="min-h-screen p-2 sm:p-4 md:p-5">
      <div className="mx-auto max-w-[1800px] space-y-3 sm:space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-2 rounded-2xl border border-[#808080]/30 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">RCP Time Tracker</h1>
            <p className="text-xs sm:text-sm text-[#D9D9D9] truncate">{session.user.email}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-xl border border-[#808080]/30 px-3 py-1.5 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors">
              Sign out
            </button>
          </form>
        </div>

        <DashboardTabs
          hasProjects={hasProjects}
          recoveredSession={!!data.session}
          activityContent={
            !hasProjects ? (
              <Card>
                <div className="py-6 sm:py-8 text-center">
                  <p className="text-sm sm:text-base font-bold text-[#D9D9D9]">No projects assigned</p>
                  <p className="mt-1 text-sm text-[#808080]">
                    Ask your administrator to assign you to a project before you can track time.
                  </p>
                </div>
              </Card>
            ) : (
              <ActivityContent
                statsData={statsData}
                entryDateStrings={entryDateStrings}
                projectOptions={projectOptions}
                activeSession={
                  data.session
                    ? {
                        id: data.session.id,
                        projectId: data.session.projectId,
                        notesDraft: data.session.notesDraft,
                        accumulatedSeconds: data.session.accumulatedSeconds,
                        status: data.session.status as "RUNNING" | "PAUSED",
                        startedAt: data.session.startedAt.toISOString(),
                        lastResumedAt: data.session.lastResumedAt?.toISOString() ?? null,
                      }
                    : null
                }
                entries={data.entries}
                hasRecoveredSession={!!data.session}
              />
            )
          }
          meetingsContent={
            <Card>
              <TimesheetPanel groups={calendarGroups} projects={projectOptions} hasToken={!!accessToken} />
            </Card>
          }
          insightsContent={
            <Card>
              <InsightsPanel data={insightsData} />
            </Card>
          }
          aliasesContent={
            <Card>
              <ProjectAliases assignments={aliasEntries} />
            </Card>
          }
        />
      </div>
    </main>
  );
}