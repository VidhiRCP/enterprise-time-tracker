"use client";

import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { z } from "zod";
import DateInput from "../ui/date-input";

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
    const [rawResponse, setRawResponse] = useState<any | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // hold the selected file locally until user clicks Save
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [form, setForm] = useState({
      receiptId: "",
      receiptFileName: "",
      expenseDate: "",
      amount: "",
      currency: "NZD",
      merchant: "",
      details: "",
      projectId: "",
    });
      const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [expenses, setExpenses] = useState<any[]>([]); // TODO: fetch from server
    const [isSaving, setIsSaving] = useState(false);

  // Drag-and-drop/upload handler
  function handleFileChange(f: File) {
    if (!f) return;
    setFile(f);
    setPendingFile(f);
    setExtraction(null);
    setForm({ receiptId: "", receiptFileName: f?.name ?? "", expenseDate: "", amount: "", currency: "NZD", merchant: "", details: "", projectId: "" });
    setError(null);
    // manage preview URL
    try {
      if (previewUrl) {
        try { URL.revokeObjectURL(previewUrl); } catch {}
      }
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } catch {}
    // run extraction only (do not persist file or create DB rows yet)
    uploadAndExtract(f);
  }

  async function uploadAndExtract(f: File) {
    // call a non-persisting extraction endpoint (server should only run OCR/AI and return extracted fields)
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      // try an extract-only endpoint; if your server doesn't have this, you can point to the same upload endpoint but ensure server doesn't persist until Save
      const res = await fetch("/api/expenses/extract", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        // fall back to the upload endpoint if extract isn't available
        const fallback = await fetch("/api/expenses/upload", { method: "POST", body: fd, credentials: "include" });
        if (!fallback.ok) throw new Error(await fallback.text());
        const data = await fallback.json();
        // capture raw response if provided for debugging
        setRawResponse(data.rawResponse ?? data ?? null);
        const extracted = data.extracted ?? { date: null, amount: null, amount_total: null, currency: null, merchant: null, details: null };
        // map new/old keys safely
        const mapped = {
          date: extracted.date ?? extracted.date ?? null,
          amount: String(extracted.amount_total ?? extracted.amount ?? "").trim() || "",
          currency: String(extracted.currency ?? "").trim() || "",
          merchant: String(extracted.merchant ?? "").trim() || "",
          details: String(extracted.details ?? "").trim() || "",
        };
        setExtraction(extracted);
        // fallback upload returned a persisted receiptId; use it
        // Normalize currency
        let fbCurrency = "NZD";
        try {
          const c = String(extracted.currency ?? "").trim().toUpperCase();
          if (/USD/.test(c) || /\bUS\b/.test(c)) fbCurrency = "USD";
          else if (/NZD|\bNZ\b/.test(c)) fbCurrency = "NZD";
          else if (/CAD/.test(c)) fbCurrency = "CAD";
          else if (c.length === 3) fbCurrency = c;
        } catch {}
        setForm((cur) => ({ ...cur, receiptId: data.receiptId ?? cur.receiptId, receiptFileName: f.name ?? cur.receiptFileName, expenseDate: mapped.date ?? cur.expenseDate, amount: mapped.amount ?? cur.amount, currency: fbCurrency, merchant: mapped.merchant ?? cur.merchant, details: mapped.details ?? cur.details }));
        // since file was uploaded by fallback, clear pendingFile
        setPendingFile(null);
      } else {
        const data = await res.json();
        setRawResponse(data.rawResponse ?? data ?? null);
        const extracted = data.extracted ?? { date: null, amount: null, amount_total: null, currency: null, merchant: null, details: null };
        const mapped = {
          date: extracted.date ?? extracted.date ?? null,
          amount: String(extracted.amount_total ?? extracted.amount ?? "").trim() || "",
          currency: String(extracted.currency ?? "").trim() || "",
          merchant: String(extracted.merchant ?? "").trim() || "",
          details: String(extracted.details ?? "").trim() || "",
        };
        setExtraction(extracted);
        // Normalize date to YYYY-MM-DD for the date input
        let normDate = "";
        try {
          if (mapped.date) {
            const d = new Date(mapped.date as any);
            if (!isNaN(d.getTime())) normDate = d.toISOString().slice(0, 10);
          }
        } catch {
          normDate = "";
        }
        // Normalize amount to numeric string (strip currency symbols)
        let normAmount = "";
        try {
          if (mapped.amount) {
            const cleaned = String(mapped.amount).replace(/[^0-9.\-]/g, "");
            if (cleaned) normAmount = String(parseFloat(cleaned));
          }
        } catch {
          normAmount = "";
        }

        // uploadToStorageAndExtractOnly returned a filePath; store it in receiptId so Save can use it to create DB rows without re-upload
        // Normalize currency from extraction
        let normCurrency = "NZD";
        try {
          const c = String(mapped.currency ?? "").trim().toUpperCase();
          if (/USD/.test(c) || /\bUS\b/.test(c)) normCurrency = "USD";
          else if (/NZD|\bNZ\b/.test(c)) normCurrency = "NZD";
          else if (/CAD/.test(c)) normCurrency = "CAD";
          else if (c.length === 3) normCurrency = c;
        } catch {}
        setForm((cur) => ({ ...cur, receiptId: data.filePath ?? cur.receiptId, receiptFileName: f.name ?? cur.receiptFileName, expenseDate: normDate, amount: normAmount, currency: normCurrency, merchant: mapped.merchant, details: mapped.details }));
        // since extract endpoint uploaded the file, clear pendingFile to avoid double upload
        setPendingFile(null);
      }
      setConfirmed(false);
    } catch (e: any) {
      setError(String(e.message ?? e));
    } finally {
      setUploading(false);
    }
  }

  // Review form change
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const target = (e && ((e.target as any) ?? (e.currentTarget as any))) ?? null;
    if (!target) return;
    const name = target.name as string | undefined;
    const value = target.value;
    if (!name) return;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  // Save handler
  async function handleSave() {
    setError(null);
    try {
      // If there's a pending file, upload it first to get a receiptId
      let receiptId = form.receiptId;
      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        const resUpload = await fetch("/api/expenses/upload", { method: "POST", body: fd, credentials: "include" });
        if (!resUpload.ok) {
          throw new Error(await resUpload.text());
        }
        const up = await resUpload.json();
        receiptId = up.receiptId ?? "";
      }

      if (!receiptId) {
        setError("No receipt available to save. Please upload a receipt before saving.");
        return;
      }

      const payload = {
        receiptId,
        projectId: form.projectId,
        expenseDate: form.expenseDate,
        amount: form.amount,
        currency: form.currency,
        merchant: form.merchant,
        details: form.details,
        rawExtraction: extraction ?? undefined,
      };

      const parsed = ExpenseSchema.safeParse({ ...payload, receiptId });
      if (!parsed.success) {
        setError("Please fill all fields correctly.");
        return;
      }

      let res: Response;
      if (editingEntryId) {
        // update existing entry
        res = await fetch("/api/expenses/update", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entryId: editingEntryId, ...payload }) });
      } else {
        res = await fetch("/api/expenses/save", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      }
      if (!res.ok) {
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
      // exit edit mode if we updated
      setEditingEntryId(null);
      // clear
      setFile(null);
      setPendingFile(null);
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
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={e => {
                const f = (e.target as HTMLInputElement).files?.[0];
                if (f) handleFileChange(f);
              }}
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
                    <DateInput value={form.expenseDate} onChange={(v) => setForm(prev => ({ ...prev, expenseDate: v }))} placeholder="Date" />
                  </div>
              </div>
              {/* Debug: raw extraction JSON (toggleable) */}
              {extraction && (
                <div className="mt-3 text-xs text-[#808080]">
                  <details>
                    <summary className="cursor-pointer">Show raw extraction JSON</summary>
                    <pre className="whitespace-pre-wrap break-all mt-2 p-2 bg-[#0b0b0b] border border-[#333] text-[11px]">{JSON.stringify(rawResponse ?? extraction, null, 2)}</pre>
                  </details>
                </div>
              )}
              
              <div>
                <label className="text-xs font-bold mb-1 block">Amount</label>
                <input name="amount" type="number" value={form.amount} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
              </div>
              <div>
                <label className="text-xs font-bold mb-1 block">Currency</label>
                <select name="currency" value={form.currency} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm">
                  <option value="USD">USD</option>
                  <option value="NZD">NZD</option>
                  <option value="CAD">CAD</option>
                </select>
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
                <label className="inline-flex items-center mr-4">
                  <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="mr-2" />
                  <span className="text-xs">I confirm the extracted info is correct</span>
                </label>

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
                  disabled={uploading || (!pendingFile && !form.receiptId) || !form.projectId || !confirmed || isSaving}
                  className="bg-[#F40000] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#F40000]/80 disabled:opacity-40 transition-all"
                >
                  {isSaving ? "Saving…" : "Save Expense"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // discard pending upload and reset form
                    try { if (previewUrl) { URL.revokeObjectURL(previewUrl); } } catch {}
                    setFile(null);
                    setPendingFile(null);
                    setExtraction(null);
                    setPreviewUrl(null);
                    setRawResponse(null);
                    // clear native file input so same file can be re-selected instantly
                    try { if (fileInputRef.current) fileInputRef.current.value = ""; } catch {}
                    setForm({ receiptId: "", receiptFileName: "", expenseDate: "", amount: "", currency: "NZD", merchant: "", details: "", projectId: "" });
                    setConfirmed(false);
                    setError(null);
                  }}
                  className="ml-3 px-3 py-2 text-xs sm:text-sm text-[#D9D9D9] bg-[#1f1f1f] hover:bg-[#2a2a2a] transition-colors"
                >
                  Discard
                </button>

                <div className="text-xs text-[#808080]">{form.receiptFileName ? `File: ${form.receiptFileName}` : ''}</div>
              </div>
            </form>

            <aside className="md:col-span-1 bg-[#121212] border border-[#808080]/10 p-3">
              <div className="text-xs font-bold text-[#D9D9D9] mb-2">Preview</div>
              <div className="mb-3">
                {previewUrl ? (
                  file?.type.startsWith('image/') ? (
                    <img src={previewUrl} alt={form.receiptFileName} className="w-full max-h-[420px] object-contain bg-black" />
                  ) : (
                    <object data={previewUrl} type={file?.type} className="w-full h-[420px]">Preview not available</object>
                  )
                ) : (
                  <div className="text-xs text-[#808080]">No preview available</div>
                )}
              </div>
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
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        // populate form for editing
                        setEditingEntryId(exp.id);
                        setForm({
                          receiptId: exp.receiptFilePath ?? "",
                          receiptFileName: "",
                          expenseDate: exp.expenseDate ?? "",
                          amount: String(exp.amount ?? ""),
                          currency: exp.currency ?? "NZD",
                          merchant: exp.merchant ?? "",
                          details: exp.details ?? "",
                          projectId: exp.projectId ?? "",
                        });
                        // clear any pendingFile state
                        setPendingFile(null);
                        // scroll to top so the edit form is visible
                        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
                      }}
                      className="text-xs text-[#808080] hover:text-[#D9D9D9]"
                    >
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
