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
        <label className="text-sm font-medium text-[#D9D9D9]">Project</label>
        <select
          name="projectId"
          required
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
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
          <label className="text-sm font-medium text-[#D9D9D9]">Date</label>
          <input
            type="date"
            name="workDate"
            defaultValue={localDateInputValue()}
            required
            className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium text-[#D9D9D9]">Duration (minutes)</label>
          <input
            type="number"
            name="durationMinutes"
            min={1}
            step={1}
            placeholder="60"
            required
            className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[#D9D9D9]">Notes</label>
        <textarea
          name="notes"
          rows={3}
          className="w-full rounded-xl border border-[#808080]/30 bg-black px-3 py-2 text-sm focus:border-[#F40000] focus:outline-none"
          placeholder="Add notes for this entry"
        />
      </div>

      <button className="rounded-xl border border-[#808080]/30 px-4 py-2 text-sm font-bold text-[#F8F8F8] hover:border-[#D9D9D9] transition-colors">
        Save manual entry
      </button>
    </form>
  );
}