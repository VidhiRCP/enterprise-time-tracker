"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { z } from "zod";

// Zod schema for review form
const ExpenseSchema = z.object({
  receiptId: z.string().min(1),
  expenseDate: z.string().min(1),
  amount: z.string().min(1),
  currency: z.string().min(1),
  merchant: z.string(),
  details: z.string(),
  projectId: z.string().min(1),
});

export function ExpenseTracker({ projects, userId }: { projects: { projectId: string; projectName: string }[]; userId: string }) {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [extraction, setExtraction] = useState<any | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [form, setForm] = useState({
      receiptId: "",
      receiptFileName: "",
      expenseDate: "",
      amount: "",
      currency: "",
      merchant: "",
      details: "",
      projectId: "",
    });
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [expenses, setExpenses] = useState<any[]>([]); // TODO: fetch from server
    const [isSaving, setIsSaving] = useState(false);

  // Drag-and-drop/upload handler
  function handleFileChange(f: File) {
    setFile(f);
    setExtraction(null);
    setForm({ receiptId: "", receiptFileName: f.name ?? "", expenseDate: "", amount: "", currency: "", merchant: "", details: "", projectId: "" });
    setError(null);
    // manage preview URL
    try {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch {}
      }
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } catch {}
    // TODO: upload to Supabase, trigger extraction
    uploadAndExtract(f);
  }

  async function uploadAndExtract(f: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/expenses/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      // normalize extracted shape and ensure strings
      const extracted = data.extracted ?? { date: "", amount: "", currency: "", merchant: "", details: "" };
      extracted.date = String(extracted.date ?? "");
      extracted.amount = String(extracted.amount ?? "");
      extracted.currency = String(extracted.currency ?? "");
      extracted.merchant = String(extracted.merchant ?? "");
      extracted.details = String(extracted.details ?? "");
      setExtraction(extracted);
      setForm({
        receiptId: data.receiptId ?? "",
        receiptFileName: f.name ?? "",
        expenseDate: extracted.date ?? "",
        amount: extracted.amount ?? "",
        currency: extracted.currency ?? "",
        merchant: extracted.merchant ?? "",
        details: extracted.details ?? "",
        projectId: "",
      });
      // reset confirmation because new extraction
      setConfirmed(false);
      // preserve preview URL (already set client-side)
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  // Review form change
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // Save handler
  async function handleSave() {
    setError(null);
    // ensure receipt was uploaded
    if (!form.receiptId) {
      setError("No receipt uploaded. Please upload a receipt before saving.");
      return;
    }

    const payload = {
      receiptId: form.receiptId,
      projectId: form.projectId,
      expenseDate: form.expenseDate,
      amount: form.amount,
      currency: form.currency,
      merchant: form.merchant,
      details: form.details,
    };

    const parsed = ExpenseSchema.safeParse(payload);
    if (!parsed.success) {
      setError("Please fill all fields correctly.");
      return;
    }

    try {
      const res = await fetch("/api/expenses/save", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        // try to parse JSON error body
        const txt = await res.text();
        try {
          const j = JSON.parse(txt);
          setError(j.error ?? JSON.stringify(j));
          throw new Error(j.error ?? txt);
        } catch (_e) {
          throw new Error(txt || res.statusText);
        }
      }

      await loadExpenses();
      // clear
      setFile(null);
      setExtraction(null);
      setForm({ receiptId: "", receiptFileName: "", expenseDate: "", amount: "", currency: "", merchant: "", details: "", projectId: "" });
    } catch (e: any) {
      setError(String(e.message ?? e));
    }
  }

  async function loadExpenses() {
    try {
      const res = await fetch("/api/expenses/list", { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setExpenses(data ?? []);
    } catch (e) {
      // ignore silently
    }
  }

  useEffect(() => { loadExpenses(); }, []);

  // revoke preview object URL when preview changes or component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch {}
      }
    };
  }, [previewUrl]);

  return (
    <div className="space-y-8">
      <Card accent>
        <h2 className="text-base sm:text-lg font-bold mb-4">Expense Tracker</h2>
        {/* Drag-and-drop/upload area */}
        <div className="mb-6">
          <label className="block text-xs font-bold mb-2">Upload Receipt (Image or PDF)</label>
          <label className="flex items-center gap-3 w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm cursor-pointer hover:bg-[#0f0f0f]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0" aria-hidden>
              <path d="M21 15v4a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h11" stroke="#D9D9D9" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 3v6a2 2 0 0 1-2 2H7" stroke="#D9D9D9" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-[#D9D9D9]">{file ? file.name : "Choose file or drop here"}</span>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={e => e.target.files && handleFileChange(e.target.files[0])}
              className="sr-only"
            />
          </label>
        </div>
        {/* Extraction loading state */}
        {uploading && <div className="text-xs text-[#808080] mb-4">Extracting data from receipt...</div>}
        {/* Editable review form + receipt preview */}
        {file && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <form className="space-y-4 md:col-span-2">
              <div>
                <label className="text-xs font-bold mb-1 block">Date</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">📅</div>
                  <input
                    name="expenseDate"
                    type="date"
                    value={form.expenseDate}
                    onChange={handleFormChange}
                    className="w-full border border-[#808080]/30 bg-black pl-10 pr-3 py-2 text-xs sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Amount</label>
                <input name="amount" type="number" value={form.amount} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Currency</label>
                <input name="currency" type="text" value={form.currency} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Merchant/Vendor</label>
                <input name="merchant" type="text" value={form.merchant} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Details</label>
                <textarea name="details" value={form.details} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Project</label>
                <select name="projectId" value={form.projectId} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm">
                  <option value="">Select project</option>
                  {projects.map(p => (
                    <option key={p.projectId} value={p.projectId}>{p.projectName}</option>
                  ))}
                </select>
              </div>

              {error && <div className="text-xs text-red-500">{error}</div>}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={async () => {
                    setIsSaving(true);
                    try {
                      await handleSave();
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  disabled={uploading || !form.receiptId || !form.projectId || !confirmed || isSaving}
                  className="bg-[#F40000] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#F40000]/80 disabled:opacity-40 transition-all"
                >
                  {isSaving ? "Saving…" : "Save Expense"}
                </button>
                <div className="text-xs text-[#808080]">{form.receiptFileName ? `File: ${form.receiptFileName}` : ''}</div>
              </div>
            </form>

            <aside className="md:col-span-1 bg-[#121212] border border-[#808080]/10 p-3">
              <div className="text-xs font-bold text-[#D9D9D9] mb-2">AI extraction preview</div>
              <div className="text-xs text-[#D9D9D9] mb-3">
                <div className="mb-1">Date: {extraction?.date || '—'}</div>
                <div className="mb-1">Amount: {extraction?.amount || '—'}</div>
                <div className="mb-1">Currency: {extraction?.currency || '—'}</div>
                <div className="mb-1">Merchant: {extraction?.merchant || '—'}</div>
                <div className="mb-1">Details: {extraction?.details || '—'}</div>
              </div>

              <div className="mb-3">
                <div className="text-xs font-bold text-[#D9D9D9] mb-2">Receipt</div>
                {previewUrl ? (
                  file?.type.startsWith('image/') ? (
                    <img src={previewUrl} alt={form.receiptFileName} className="w-full max-h-72 object-contain bg-black" />
                  ) : (
                    <object data={previewUrl} type={file?.type} className="w-full h-72">Preview not available</object>
                  )
                ) : (
                  <div className="text-xs text-[#808080]">No preview available</div>
                )}
              </div>

              <label className="inline-flex items-center mt-1">
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mr-2" />
                <span className="text-xs">I confirm the extracted info is correct</span>
              </label>
            </aside>
          </div>
        )}
      </Card>
      {/* Table listing saved expenses */}
      <Card accent>
        <h3 className="text-xs sm:text-sm font-bold text-[#D9D9D9] mb-4">Saved Expenses</h3>
        <table className="min-w-full border-collapse text-xs sm:text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Currency</th>
              <th className="px-3 py-2 text-left">Merchant</th>
              <th className="px-3 py-2 text-left">Details</th>
              <th className="px-3 py-2 text-left">Project</th>
              <th className="px-3 py-2 text-left">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 && (
              <tr><td colSpan={7} className="text-[#808080] py-4 text-center">No expenses yet.</td></tr>
            )}
            {expenses.map(exp => (
              <tr key={exp.id}>
                <td className="px-3 py-2">{exp.expenseDate}</td>
                <td className="px-3 py-2">{exp.amount}</td>
                <td className="px-3 py-2">{exp.currency}</td>
                <td className="px-3 py-2">{exp.merchant}</td>
                <td className="px-3 py-2">{exp.details}</td>
                <td className="px-3 py-2">{exp.projectName}</td>
                <td className="px-3 py-2"><a href={exp.publicUrl ?? exp.receiptFilePath} target="_blank" rel="noopener" className="text-[#F40000] underline">View</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
