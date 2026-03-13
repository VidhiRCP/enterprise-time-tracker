"use client";

import { useState } from "react";

export function ExportData() {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState<{ [k: string]: boolean }>({ activities: true, timesheets: false, expenses: true });
  const [format, setFormat] = useState("csv");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [project, setProject] = useState("");
  const [user, setUser] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    setLoading(true);
    try {
      const body = {
        type: Object.keys(types).filter((k) => types[k]),
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        project: project || undefined,
        user: user || undefined,
        status: status || undefined,
        format,
      };
      const res = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error((j && j.error) || `Export failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = format === "xlsx" ? "xlsx" : "csv";
      a.href = url;
      a.download = `export-${new Date().toISOString().slice(0,10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (err: any) {
      setError(String(err.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-block">
      <button
        onClick={() => setOpen(true)}
        className="border border-[#808080]/30 px-3 py-2 text-sm text-[#D9D9D9] hover:text-[#F8F8F8] transition-colors"
      >
        Export Data
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-black border border-[#808080]/30 p-4 w-full max-w-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold">Export Data</h3>
              <button onClick={() => setOpen(false)} className="text-sm text-[#808080]">✕</button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <div className="font-medium mb-1">What would you like to export?</div>
                <label className="inline-flex items-center mr-3"><input type="checkbox" checked={types.activities} onChange={(e) => setTypes((s) => ({ ...s, activities: e.target.checked }))} /> <span className="ml-2">Activities</span></label>
                <label className="inline-flex items-center mr-3"><input type="checkbox" checked={types.timesheets} onChange={(e) => setTypes((s) => ({ ...s, timesheets: e.target.checked }))} /> <span className="ml-2">Timesheets</span></label>
                <label className="inline-flex items-center mr-3"><input type="checkbox" checked={types.expenses} onChange={(e) => setTypes((s) => ({ ...s, expenses: e.target.checked }))} /> <span className="ml-2">Expenses</span></label>
              </div>

              <div>
                <div className="font-medium mb-1">Format</div>
                <select value={format} onChange={(e) => setFormat(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm">
                  <option value="csv">CSV</option>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="pdf">PDF (not implemented)</option>
                </select>
              </div>

              <div>
                <div className="font-medium mb-1">Filters (optional)</div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm" placeholder="Start date" />
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm" placeholder="End date" />
                  <input type="text" value={project} onChange={(e) => setProject(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm" placeholder="Project ID" />
                  <input type="text" value={user} onChange={(e) => setUser(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm" placeholder="User email" />
                  <input type="text" value={status} onChange={(e) => setStatus(e.target.value)} className="border border-[#808080]/30 bg-black px-2 py-1 text-sm col-span-2" placeholder="Status" />
                </div>
              </div>

              {error && <div className="text-xs text-[#F40000]">{error}</div>}

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setOpen(false)} className="text-sm text-[#808080] border px-3 py-1">Cancel</button>
                <button onClick={submit} disabled={loading} className="bg-[#F40000] px-3 py-1 text-sm text-white">{loading ? "Exporting…" : "Export"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportData;
