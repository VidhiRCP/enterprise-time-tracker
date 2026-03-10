import { format } from "date-fns";
import { formatMinutes } from "@/lib/time";

type Entry = {
  id: string;
  workDate: Date;
  durationMinutes: number;
  notes: string | null;
  source: string;
  status: string;
  project: {
    projectId: string;
    projectName: string;
  };
};

export function EntryTable({ entries }: { entries: Entry[] }) {
  if (!entries.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-sm text-slate-600">
        No entries yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-medium text-slate-600">Date</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-medium text-slate-600">Project</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-medium text-slate-600">Duration</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-medium text-slate-600">Source</th>
            <th className="border-b border-slate-200 px-4 py-3 text-left font-medium text-slate-600">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="bg-white">
              <td className="border-b border-slate-100 px-4 py-3">
                {format(entry.workDate, "yyyy-MM-dd")}
              </td>
              <td className="border-b border-slate-100 px-4 py-3 font-medium">
                {entry.project.projectName}
              </td>
              <td className="border-b border-slate-100 px-4 py-3">
                {formatMinutes(entry.durationMinutes)}
              </td>
              <td className="border-b border-slate-100 px-4 py-3">
                {entry.source}
              </td>
              <td className="border-b border-slate-100 px-4 py-3">
                {entry.notes ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}