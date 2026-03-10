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
      <main className="min-h-screen bg-slate-50 p-8">
        <div className="mx-auto max-w-3xl">
          <SignInCard />
        </div>
      </main>
    );
  }

  const data = await getDashboardData(session.user.email);
  const totalMinutes = data.entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">PM Time Tracker</h1>
            <p className="mt-1 text-sm text-slate-600">
              Signed in as {session.user.email}
            </p>
          </div>

          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">
              Sign out
            </button>
          </form>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <div className="text-sm text-slate-500">Assigned projects</div>
            <div className="mt-2 text-3xl font-semibold">{data.projects.length}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">My entries</div>
            <div className="mt-2 text-3xl font-semibold">{data.entries.length}</div>
          </Card>
          <Card>
            <div className="text-sm text-slate-500">Total tracked</div>
            <div className="mt-2 text-3xl font-semibold">{formatMinutes(totalMinutes)}</div>
          </Card>
        </div>

        {data.session ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Recovered an unfinished timer session. You can resume, pause, save, or discard it.
          </div>
        ) : null}

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
                  <h2 className="text-xl font-semibold">Manual entry</h2>
                  <p className="mt-1 text-sm text-slate-600">
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
                  <h2 className="text-xl font-semibold">Recent entries</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    You only see your own entries. Projects are scoped to your assignments.
                  </p>
                </div>
                <EntryTable entries={data.entries} />
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}