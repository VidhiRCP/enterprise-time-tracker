"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { z } from "zod";

// Zod schema for review form
const ExpenseSchema = z.object({
  expenseDate: z.string(),
  amount: z.string(),
  currency: z.string(),
  merchant: z.string(),
  details: z.string(),
  projectId: z.string(),
});

export function ExpenseTracker({ projects, userId }: { projects: { projectId: string; projectName: string }[]; userId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extraction, setExtraction] = useState<any | null>(null);
  const [form, setForm] = useState({
    expenseDate: "",
    amount: "",
    currency: "",
    merchant: "",
    details: "",
    projectId: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]); // TODO: fetch from server

  // Drag-and-drop/upload handler
  function handleFileChange(f: File) {
    setFile(f);
    setExtraction(null);
    setForm({ expenseDate: "", amount: "", currency: "", merchant: "", details: "", projectId: "" });
    setError(null);
    // TODO: upload to Supabase, trigger extraction
  }

  // Review form change
  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  // Save handler
  async function handleSave() {
    setError(null);
    const parsed = ExpenseSchema.safeParse(form);
    if (!parsed.success) {
      setError("Please fill all fields correctly.");
      return;
    }
    // TODO: save to server
  }

  return (
    <div className="space-y-8">
      <Card accent>
        <h2 className="text-base sm:text-lg font-bold mb-4">Expense Tracker</h2>
        {/* Drag-and-drop/upload area */}
        <div className="mb-6">
          <label className="block text-xs font-bold mb-2">Upload Receipt (Image or PDF)</label>
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={e => e.target.files && handleFileChange(e.target.files[0])}
            className="block w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm"
          />
        </div>
        {/* Extraction loading state */}
        {uploading && <div className="text-xs text-[#808080] mb-4">Extracting data from receipt...</div>}
        {/* Editable review form */}
        {file && (
          <form className="space-y-4">
            <div>
              <label className="text-xs font-bold mb-1 block">Date</label>
              <input name="expenseDate" type="date" value={form.expenseDate} onChange={handleFormChange} className="w-full border border-[#808080]/30 bg-black px-3 py-2 text-xs sm:text-sm" />
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
            <button type="button" onClick={handleSave} className="bg-[#F40000] px-4 py-2 text-xs sm:text-sm font-medium text-white hover:bg-[#F40000]/80 disabled:opacity-40 transition-all">Save Expense</button>
          </form>
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
                <td className="px-3 py-2"><a href={exp.receiptFilePath} target="_blank" rel="noopener" className="text-[#F40000] underline">View</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
