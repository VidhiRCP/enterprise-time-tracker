"use client";

import { format } from "date-fns";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { allocateCalendarEvent } from "@/lib/actions";
import type { GroupedEvents, CalendarEvent } from "@/lib/calendar";
import { Card } from "@/components/ui/card";

type ProjectOption = {
  projectId: string;
  projectName: string;
};

function formatDuration(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatTime(iso: string) {
  return format(new Date(iso), "HH:mm");
}

function EventRow({
  event,
  projects,
}: {
  event: CalendarEvent;
  projects: ProjectOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const hasSuggestion = !event.allocatedProjectId && !!event.suggestedProjectId;

  function handleChange(projectId: string) {
    startTransition(async () => {
      await allocateCalendarEvent({
        eventId: event.id,
        eventSubject: event.subject,
        eventStart: event.start,
        eventEnd: event.end,
        durationMin: event.durationMinutes,
        projectId: projectId || null,
      });
    });
  }

  function handleAcceptSuggestion() {
    if (!event.suggestedProjectId) return;
    handleChange(event.suggestedProjectId);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#808080]/10 pb-3 sm:pb-4 pt-1 hover:bg-[#F8F8F8]/[0.02] transition-colors">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold truncate">{event.subject}</span>
          {event.isAllDay && (
            <span className="text-sm sm:text-base font-bold border border-[#808080]/30 px-1.5 py-0.5">
              All day
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-[#808080]">
          {!event.isAllDay && (
            <span className="text-[#D9D9D9]">
              {formatTime(event.start)} – {formatTime(event.end)}
            </span>
          )}
          <span>{formatDuration(event.durationMinutes)}</span>
          {event.attendees.length > 0 && (
            <span className="truncate max-w-[200px] sm:max-w-[300px]">
              {event.attendees.slice(0, 3).join(", ")}
              {event.attendees.length > 3 && ` +${event.attendees.length - 3}`}
            </span>
          )}
        </div>

        {hasSuggestion && (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs sm:text-sm text-yellow-400/80">
              ✨ Suggested: <span className="font-bold">{event.suggestedProjectName}</span>
            </span>
            <button
              onClick={handleAcceptSuggestion}
              disabled={isPending}
              className="text-xs sm:text-sm text-[#F40000] hover:text-[#F40000]/80 font-medium disabled:opacity-40"
            >
              Accept
            </button>
          </div>
        )}
      </div>

      <div className="flex-shrink-0">
        <select
          value={event.allocatedProjectId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className={`w-full sm:w-48 border bg-black px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm focus:border-[#F40000] focus:outline-none disabled:opacity-40 transition-opacity ${
            hasSuggestion
              ? "border-yellow-400/40"
              : "border-[#808080]/30"
          } app-input`}
        >
          <option value="">— Select project —</option>
          {projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>
              {p.projectName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function TimesheetPanel({
  groups,
  projects,
  hasToken = false,
  onRefresh,
}: {
  groups: GroupedEvents[];
  projects: ProjectOption[];
  hasToken?: boolean;
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();

  function handleRefresh() {
    if (onRefresh) {
      startRefresh(() => onRefresh());
      return;
    }
    startRefresh(() => {
      router.refresh();
    });
  }

  if (!hasToken) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
        <p className="text-xs sm:text-sm font-bold text-[#D9D9D9]">
          Calendar access not available
        </p>
        <p className="mt-1 text-xs sm:text-sm text-[#808080]">
          Please sign out and sign back in to grant calendar permissions.
        </p>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="border border-dashed border-[#808080]/30 p-4 sm:p-6 text-center">
        <p className="text-xs sm:text-sm text-[#808080]">
          No calendar events found for this week.
        </p>
        <p className="mt-1 text-xs sm:text-sm text-[#808080]/60">
          Make sure your Outlook calendar has events this week (Mon–Sun).
        </p>
      </div>
    );
  }

  const totalAllocated = groups.reduce(
    (sum, g) => sum + g.events.filter((e) => e.allocatedProjectId).length,
    0,
  );
  const totalEvents = groups.reduce((sum, g) => sum + g.events.length, 0);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-base sm:text-lg font-bold">Meeting Tracker</h2>
          <p className="mt-0.5 text-xs sm:text-sm text-[#D9D9D9]">
            This week&apos;s non-private calendar events. Allocate each to a project.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="border border-[#808080]/30 px-3 py-1.5 text-xs sm:text-sm text-[#D9D9D9] hover:text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors disabled:opacity-40"
          >
            {isRefreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
          <div className="text-xs sm:text-sm text-[#808080]">
            <span className="text-[#F8F8F8] font-bold">{totalAllocated}</span> / {totalEvents} allocated
          </div>
        </div>
      </div>

      <div className="border-t border-[#F40000]/25" />

      {groups.map((group) => (
        <Card accent className="p-7 mb-8" key={group.date}>
          <div className="flex items-center gap-4 mb-4">
            <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9]">
              {format(new Date(group.date + "T12:00:00"), "EEEE, dd-MM-yyyy")}
            </h3>
            <div className="flex-1 border-t border-[#808080]/20" />
            <span className="text-xs sm:text-sm text-[#808080]">
              {group.events.length} event{group.events.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="space-y-3">
            {group.events.map((event) => (
              <EventRow key={event.id} event={event} projects={projects} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
