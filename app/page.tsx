import { auth, signOut } from "@/auth";
import { getDashboardData } from "@/lib/queries";
import { formatMinutes } from "@/lib/time";
import { Card } from "@/components/ui/card";
import { SignInCard } from "@/components/sign-in-card";
import { TimerPanel } from "@/components/time/timer-panel";
import { ManualEntryForm } from "@/components/time/manual-entry-form";
import { EntryTable } from "@/components/time/entry-table";

export default async function HomePage() {
  const session = await auth();

  if (!session?.user?.email) {
    return (
      <main className="min-h-screen p-8">
        <div className="mx-auto max-w-3xl pt-16">
          <SignInCard />
        </div>
      </main>
    );
  }

  const data = await getDashboardData(session.user.email);
  const totalMinutes = data.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
  const hasProjects = data.projects.length > 0;

  return (
    <main className="min-h-screen p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-[#808080]/30 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">PM Time Tracker</h1>
            <p className="mt-1 text-sm text-[#D9D9D9]">
              Signed in as {session.user.email}
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-xl border border-[#808080]/30 px-4 py-2 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors">
              Sign out
            </button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <div className="text-xs uppercase tracking-wider text-[#808080]">Assigned projects</div>
            <div className="mt-1 text-xl font-bold">{data.projects.length}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wider text-[#808080]">My entries</div>
            <div className="mt-1 text-xl font-bold">{data.entries.length}</div>
          </Card>
          <Card>
            <div className="text-xs uppercase tracking-wider text-[#808080]">Total tracked</div>
            <div className="mt-1 text-xl font-bold">{formatMinutes(totalMinutes)}</div>
          </Card>
        </div>

        {data.session ? (
          <div className="rounded-xl border-l-2 border-l-[#F40000] border border-[#808080]/20 px-4 py-3 text-sm text-[#D9D9D9]">
            Recovered an unfinished timer session. You can resume, pause, save, or discard it.
          </div>
        ) : null}

        {!hasProjects ? (
          <Card>
            <div className="py-8 text-center">
              <p className="text-sm font-bold text-[#D9D9D9]">No projects assigned</p>
              <p className="mt-1 text-sm text-[#808080]">
                Ask your administrator to assign you to a project before you can track time.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[420px_1fr]">
            <Card>
              <TimerPanel
                projects={data.projects.map((project) => ({
                  projectId: project.projectId,
                  projectName: project.projectName,
                }))}
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

            <div className="space-y-6">
              <Card>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold">Manual entry</h2>
                    <p className="mt-1 text-sm text-[#D9D9D9]">
                      Add time manually for work already completed.
                    </p>
                  </div>
                  <ManualEntryForm
                    projects={data.projects.map((project) => ({
                      projectId: project.projectId,
                      projectName: project.projectName,
                    }))}
                  />
                </div>
              </Card>

              <Card>
                <div className="space-y-4">
                  <div>
                    <h2 className="text-lg font-bold">Recent entries</h2>
                    <p className="mt-1 text-sm text-[#D9D9D9]">
                      You only see your own entries. Projects are scoped to your assignments.
                    </p>
                  </div>
                  <EntryTable entries={data.entries} />
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}