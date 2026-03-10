import { createManualEntry } from "@/lib/actions";
import { localDateInputValue } from "@/lib/time";

type ProjectOption = {
  projectId: string;
  projectName: string;
};

export function ManualEntryForm({ projects }: { projects: ProjectOption[] }) {
  return (
    <form action={createManualEntry} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Project</label>
        <select
          name="projectId"
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
          defaultValue={projects[0]?.projectId ?? ""}
        >
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.projectName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Date</label>
          <input
            type="date"
            name="workDate"
            defaultValue={localDateInputValue()}
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">Duration (minutes)</label>
          <input
            type="number"
            name="durationMinutes"
            min={1}
            step={1}
            placeholder="60"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Notes</label>
        <textarea
          name="notes"
          rows={4}
          className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2"
          placeholder="Add notes for this entry"
        />
      </div>

      <button className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
        Save manual entry
      </button>
    </form>
  );
}