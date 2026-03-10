import { auth, signOut } from "@/auth";
import { getDashboardData, getInsightsData } from "@/lib/queries";
import { getCalendarEvents } from "@/lib/calendar";
import { formatMinutes } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { SignInCard } from "@/components/sign-in-card";
import { TimerPanel } from "@/components/time/timer-panel";
import { ManualEntryForm } from "@/components/time/manual-entry-form";
import { EntryTable } from "@/components/time/entry-table";
import { TimesheetPanel } from "@/components/time/timesheet-panel";
import { InsightsPanel } from "@/components/time/insights-panel";
import { ProjectAliases } from "@/components/time/project-aliases";
import { DashboardTabs } from "@/components/dashboard-tabs";

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
  const totalMinutes = data.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const hasProjects = data.projects.length > 0;

  // Fetch calendar events if we have an access token
  const accessToken = (session as any).accessToken as string | undefined;
  const calendarGroups = accessToken
    ? await getCalendarEvents(accessToken, session.user.email)
    : [];

  const projectOptions = data.projects.map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
  }));

  // Build aliases list for the Project Aliases component
  const aliasEntries = data.assignments.map((a) => ({
    projectId: a.projectId,
    projectName: a.project.projectName,
    aliases: a.aliases ?? "",
  }));

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5 md:space-y-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-[#808080]/30 p-4 sm:p-5 md:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold">RCP Time Tracker</h1>
            <p className="mt-1 text-xs sm:text-sm text-[#D9D9D9] truncate max-w-[260px] sm:max-w-none">
              Signed in as {session.user.email}
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-xl border border-[#808080]/30 px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors">
              Sign out
            </button>
          </form>
        </div>

        <DashboardTabs
          hasProjects={hasProjects}
          recoveredSession={!!data.session}
          activityContent={
            <div className="space-y-4 sm:space-y-5 md:space-y-6">
              <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                <Card>
                  <div className="text-[10px] sm:text-xs uppercase tracking-wider text-[#808080]">Assigned projects</div>
                  <div className="mt-1 text-base sm:text-lg md:text-xl font-bold">{data.projects.length}</div>
                </Card>
                <Card>
                  <div className="text-[10px] sm:text-xs uppercase tracking-wider text-[#808080]">My entries</div>
                  <div className="mt-1 text-base sm:text-lg md:text-xl font-bold">{data.entries.length}</div>
                </Card>
                <Card>
                  <div className="text-[10px] sm:text-xs uppercase tracking-wider text-[#808080]">Total tracked</div>
                  <div className="mt-1 text-base sm:text-lg md:text-xl font-bold">{formatMinutes(totalMinutes)}</div>
                </Card>
              </div>

              {data.session ? (
                <div className="rounded-xl border-l-2 border-l-[#F40000] border border-[#808080]/20 px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm text-[#D9D9D9] mb-4 sm:mb-5">
                  Recovered an unfinished timer session. You can resume, pause, save, or discard it.
                </div>
              ) : null}

              {!hasProjects ? (
                <Card>
                  <div className="py-6 sm:py-8 text-center">
                    <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">No projects assigned</p>
                    <p className="mt-1 text-xs sm:text-sm text-[#808080]">
                      Ask your administrator to assign you to a project before you can track time.
                    </p>
                  </div>
                </Card>
              ) : (
                <div className="grid gap-4 sm:gap-5 md:gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[420px_1fr]">
                  <Card>
                    <TimerPanel
                      projects={projectOptions}
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
                    />
                  </Card>

                  <div className="space-y-4 sm:space-y-5 md:space-y-6">
                    <Card>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <h2 className="text-base sm:text-lg font-bold">Manual entry</h2>
                          <p className="mt-1 text-xs sm:text-sm text-[#D9D9D9]">
                            Add time manually for work already completed.
                          </p>
                        </div>
                        <ManualEntryForm projects={projectOptions} />
                      </div>
                    </Card>

                    <Card>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <h2 className="text-base sm:text-lg font-bold">Recent entries</h2>
                          <p className="mt-1 text-xs sm:text-sm text-[#D9D9D9]">
                            You only see your own entries. Projects are scoped to your assignments.
                          </p>
                        </div>
                        <EntryTable entries={data.entries} projects={projectOptions} />
                      </div>
                    </Card>
                  </div>
                </div>
              )}
            </div>
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