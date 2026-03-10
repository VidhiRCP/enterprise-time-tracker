"use client";

import { format } from "date-fns";

type ProjectDay = {
  projectId: string;
  projectName: string;
  activityMin: number;
  meetingMin: number;
  totalMin: number;
};

type DayBreakdown = {
  date: string;
  projects: ProjectDay[];
};

type ProjectTotal = {
  projectId: string;
  projectName: string;
  activityMin: number;
  meetingMin: number;
  totalMin: number;
};

type InsightsData = {
  dailyBreakdown: DayBreakdown[];
  totalMinutes: number;
  projectTotals: ProjectTotal[];
};

function fmtMin(mins: number) {
  if (mins === 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1);
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-[#808080]/20 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  );
}

export function InsightsPanel({ data }: { data: InsightsData }) {
  const { dailyBreakdown, totalMinutes, projectTotals } = data;

  if (totalMinutes === 0 && dailyBreakdown.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
        <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">No data this week yet</p>
        <p className="mt-1 text-xs sm:text-sm text-[#808080]">
          Track time with the Activity Tracker or allocate meetings to projects in the Meeting Tracker.
        </p>
      </div>
    );
  }

  const totalActivityMin = projectTotals.reduce((s, p) => s + p.activityMin, 0);
  const totalMeetingMin = projectTotals.reduce((s, p) => s + p.meetingMin, 0);

  // Generate a textual insight
  const topProject = projectTotals[0];
  const weekDays = dailyBreakdown.length;
  const avgDailyMin = weekDays > 0 ? Math.round(totalMinutes / weekDays) : 0;
  const meetingPct = totalMinutes > 0 ? Math.round((totalMeetingMin / totalMinutes) * 100) : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-bold">Weekly Insights</h2>
        <p className="mt-0.5 text-xs sm:text-sm text-[#D9D9D9]">
          Combined time from Activity Tracker + Meeting Tracker for this week.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div className="rounded-xl border border-[#808080]/20 p-3 sm:p-4">
          <div className="text-xs sm:text-sm uppercase tracking-wider text-[#808080]">Total</div>
          <div className="mt-1 text-base sm:text-lg md:text-xl font-bold">{fmtMin(totalMinutes)}</div>
          <div className="text-xs sm:text-sm text-[#808080]">{fmtHours(totalMinutes)}h</div>
        </div>
        <div className="rounded-xl border border-[#808080]/20 p-3 sm:p-4">
          <div className="text-xs sm:text-sm uppercase tracking-wider text-[#808080]">Activity</div>
          <div className="mt-1 text-base sm:text-lg md:text-xl font-bold text-[#F40000]">{fmtMin(totalActivityMin)}</div>
          <div className="text-xs sm:text-sm text-[#808080]">{fmtHours(totalActivityMin)}h</div>
        </div>
        <div className="rounded-xl border border-[#808080]/20 p-3 sm:p-4">
          <div className="text-xs sm:text-sm uppercase tracking-wider text-[#808080]">Meetings</div>
          <div className="mt-1 text-base sm:text-lg md:text-xl font-bold text-blue-400">{fmtMin(totalMeetingMin)}</div>
          <div className="text-xs sm:text-sm text-[#808080]">{fmtHours(totalMeetingMin)}h</div>
        </div>
        <div className="rounded-xl border border-[#808080]/20 p-3 sm:p-4">
          <div className="text-xs sm:text-sm uppercase tracking-wider text-[#808080]">Avg / day</div>
          <div className="mt-1 text-base sm:text-lg md:text-xl font-bold">{fmtMin(avgDailyMin)}</div>
          <div className="text-xs sm:text-sm text-[#808080]">{weekDays} active day{weekDays !== 1 ? "s" : ""}</div>
        </div>
      </div>

      {/* AI Insight Box */}
      <div className="rounded-xl border border-[#F40000]/30 bg-[#F40000]/5 p-3 sm:p-4">
        <div className="flex items-start gap-2">
          <span className="text-sm sm:text-base">✨</span>
          <div className="text-xs sm:text-sm text-[#D9D9D9] space-y-1">
            <p>
              You&apos;ve tracked <span className="font-bold text-[#F8F8F8]">{fmtMin(totalMinutes)}</span> this
              week across <span className="font-bold text-[#F8F8F8]">{projectTotals.length}</span> project{projectTotals.length !== 1 ? "s" : ""}.
            </p>
            {topProject && (
              <p>
                Your top project is <span className="font-bold text-[#F8F8F8]">{topProject.projectName}</span> at{" "}
                <span className="font-bold text-[#F8F8F8]">{fmtMin(topProject.totalMin)}</span>.
              </p>
            )}
            <p>
              Meetings account for <span className="font-bold text-[#F8F8F8]">{meetingPct}%</span> of
              your tracked time.
            </p>
          </div>
        </div>
      </div>

      {/* Project Totals */}
      <div className="space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">By Project</h3>
        {projectTotals.map((p) => (
          <div key={p.projectId} className="rounded-xl border border-[#808080]/20 p-3 sm:p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm font-bold">{p.projectName}</span>
              <span className="text-xs sm:text-sm font-bold">{fmtMin(p.totalMin)}</span>
            </div>
            <ProgressBar value={p.totalMin} max={totalMinutes} color="#F40000" />
            <div className="flex gap-4 text-xs sm:text-sm text-[#808080]">
              <span>
                Activity: <span className="text-[#D9D9D9]">{fmtMin(p.activityMin)}</span>
              </span>
              <span>
                Meetings: <span className="text-blue-400">{fmtMin(p.meetingMin)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Daily Breakdown */}
      <div className="space-y-3">
        <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">Daily Breakdown</h3>

        {dailyBreakdown.map((day) => {
          const dayTotal = day.projects.reduce((s, p) => s + p.totalMin, 0);
          return (
            <div key={day.date} className="space-y-2">
              <div className="flex items-center gap-3">
                <h4 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">
                  {format(new Date(day.date + "T12:00:00"), "EEEE, dd-MM-yyyy")}
                </h4>
                <div className="flex-1 border-t border-[#808080]/20" />
                <span className="text-xs sm:text-sm font-bold text-[#F8F8F8]">{fmtMin(dayTotal)}</span>
              </div>

              {/* Mobile: stacked cards */}
              <div className="space-y-1.5 sm:hidden">
                {day.projects.map((p) => (
                  <div
                    key={p.projectId}
                    className="flex items-center justify-between rounded-lg border border-[#808080]/15 px-3 py-2"
                  >
                    <span className="text-xs truncate max-w-[150px]">{p.projectName}</span>
                    <div className="flex gap-2 text-xs">
                      <span className="text-[#F40000]">{p.activityMin > 0 ? fmtMin(p.activityMin) : ""}</span>
                      <span className="text-blue-400">{p.meetingMin > 0 ? fmtMin(p.meetingMin) : ""}</span>
                      <span className="font-bold">{fmtMin(p.totalMin)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table row */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs sm:text-sm">
                  <thead>
                    <tr className="text-xs sm:text-sm uppercase tracking-wider text-[#808080]">
                      <th className="text-left py-1 pr-4 font-medium">Project</th>
                      <th className="text-right py-1 px-3 font-medium">Activity</th>
                      <th className="text-right py-1 px-3 font-medium">Meetings</th>
                      <th className="text-right py-1 pl-3 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.projects.map((p) => (
                      <tr key={p.projectId} className="border-t border-[#808080]/10">
                        <td className="py-1.5 pr-4">{p.projectName}</td>
                        <td className="py-1.5 px-3 text-right text-[#F40000]">
                          {p.activityMin > 0 ? fmtMin(p.activityMin) : "—"}
                        </td>
                        <td className="py-1.5 px-3 text-right text-blue-400">
                          {p.meetingMin > 0 ? fmtMin(p.meetingMin) : "—"}
                        </td>
                        <td className="py-1.5 pl-3 text-right font-bold">{fmtMin(p.totalMin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
