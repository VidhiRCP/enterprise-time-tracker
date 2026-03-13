import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";
import { startOfWeek } from "date-fns";

function buildCsv(headers: string[], rows: Array<Record<string, any>>) {
  const esc = (s: any) => {
    if (s === null || s === undefined) return "";
    const str = String(s);
    if (str.includes(",") || str.includes("\n") || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  const headerLine = headers.join(",");
  const lines = rows.map((r) => headers.map((h) => esc((r as any)[h] ?? "")).join(","));
  return [headerLine, ...lines].join("\n");
}

async function getSignedUrl(filePath: string | null) {
  if (!filePath) return "";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return filePath;
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  try {
    const { data: signed, error: signErr } = await supabase.storage.from(process.env.SUPABASE_BUCKET ?? "receipts").createSignedUrl(filePath, 60 * 60);
    if (signErr) return filePath;
    return (signed as any).signedURL ?? (signed as any).signedUrl ?? filePath;
  } catch (_e) {
    return filePath;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const types: string[] = body.type ?? [];
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    const project = body.project ?? null;
    const userEmail = body.user ?? null;
    const status = body.status ?? null;
    const format = (body.format ?? "csv").toLowerCase();

    // Prepare structured rows for each section
    const activitiesRows: Array<Record<string, any>> = [];
    const timesheetRows: Array<Record<string, any>> = [];
    const expenseRows: Array<Record<string, any>> = [];

    if (types.includes("activities") || types.includes("all") || types.length === 0) {
      const where: any = {};
      if (startDate || endDate) where.workDate = {};
      if (startDate) where.workDate.gte = startDate;
      if (endDate) where.workDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({ where: { email: String(userEmail).toLowerCase() } });
        if (u) where.userId = u.id;
      }

      const entries = await prisma.timeEntry.findMany({ where, include: { project: true, user: true }, orderBy: { workDate: 'desc' } });
      for (const e of entries) {
        activitiesRows.push({
          date: e.workDate.toISOString().slice(0, 10),
          user: e.user?.email ?? "",
          project: e.project?.projectName ?? "",
          activity: e.notes ?? "",
          duration: String(e.durationMinutes),
          notes: e.notes ?? "",
        });
      }
    }

    if (types.includes("timesheets") || types.includes("all")) {
      const where: any = {};
      if (startDate || endDate) where.workDate = {};
      if (startDate) where.workDate.gte = startDate;
      if (endDate) where.workDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({ where: { email: String(userEmail).toLowerCase() } });
        if (u) where.userId = u.id;
      }
      const entries = await prisma.timeEntry.findMany({ where, include: { project: true, user: true } });
      const map = new Map<string, { week: string; user: string; project: string; minutes: number }>();
      for (const e of entries) {
        const ws = startOfWeek(e.workDate, { weekStartsOn: 1 }).toISOString().slice(0, 10);
        const key = `${ws}:${e.userId}:${e.projectId}`;
        const existing = map.get(key) ?? { week: ws, user: e.user?.email ?? "", project: e.project?.projectName ?? "", minutes: 0 };
        existing.minutes += e.durationMinutes;
        map.set(key, existing);
      }
      for (const r of Array.from(map.values())) {
        timesheetRows.push({ week: r.week, user: r.user, project: r.project, hours: (r.minutes / 60).toFixed(2) });
      }
    }

    if (types.includes("expenses") || types.includes("all")) {
      const where: any = {};
      if (startDate || endDate) where.expenseDate = {};
      if (startDate) where.expenseDate.gte = startDate;
      if (endDate) where.expenseDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({ where: { email: String(userEmail).toLowerCase() } });
        if (u) where.userId = u.id;
      }
      const entries = await prisma.expenseEntry.findMany({ where, include: { project: true, receipt: true }, orderBy: { expenseDate: 'desc' } });
      for (const e of entries) {
        const receiptLink = e.receiptFilePath ? await getSignedUrl(e.receiptFilePath) : "";
        expenseRows.push({
          date: e.expenseDate.toISOString().slice(0, 10),
          project: e.project?.projectName ?? "",
          vendor: e.merchant ?? "",
          amount: String(e.amount),
          currency: e.currency ?? "",
          receipt_link: receiptLink,
          status: "saved",
        });
      }
    }

    const filenameBase = `export-${new Date().toISOString().slice(0, 10)}`;

    // CSV fallback / default
    if (format === "csv") {
      const sections: string[] = [];
      if (activitiesRows.length) sections.push("== Activities ==\n" + buildCsv(["date", "user", "project", "activity", "duration", "notes"], activitiesRows));
      if (timesheetRows.length) sections.push("== Timesheets ==\n" + buildCsv(["week", "user", "project", "hours"], timesheetRows));
      if (expenseRows.length) sections.push("== Expenses ==\n" + buildCsv(["date", "project", "vendor", "amount", "currency", "receipt_link", "status"], expenseRows));
      const content = sections.join("\n\n");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
        },
      });
    }

    // Excel (.xlsx) export using ExcelJS
    if (format === "xlsx") {
      // @ts-ignore: optional dependency in some envs
      const ExcelJS: any = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      if (activitiesRows.length) {
        const ws = workbook.addWorksheet('Activities');
        ws.columns = [
          { header: 'date', key: 'date' },
          { header: 'user', key: 'user' },
          { header: 'project', key: 'project' },
          { header: 'activity', key: 'activity' },
          { header: 'duration', key: 'duration' },
          { header: 'notes', key: 'notes' },
        ];
        activitiesRows.forEach(r => ws.addRow(r));
      }
      if (timesheetRows.length) {
        const ws = workbook.addWorksheet('Timesheets');
        ws.columns = [
          { header: 'week', key: 'week' },
          { header: 'user', key: 'user' },
          { header: 'project', key: 'project' },
          { header: 'hours', key: 'hours' },
        ];
        timesheetRows.forEach(r => ws.addRow(r));
      }
      if (expenseRows.length) {
        const ws = workbook.addWorksheet('Expenses');
        ws.columns = [
          { header: 'date', key: 'date' },
          { header: 'project', key: 'project' },
          { header: 'vendor', key: 'vendor' },
          { header: 'amount', key: 'amount' },
          { header: 'currency', key: 'currency' },
          { header: 'receipt_link', key: 'receipt_link' },
          { header: 'status', key: 'status' },
        ];
        expenseRows.forEach(r => ws.addRow(r));
      }
      const ab: ArrayBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(ab);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    // PDF report export using PDFKit
    if (format === "pdf") {
      // @ts-ignore: optional dependency in some envs
      const PDFKit: any = await import('pdfkit');
      const doc = new PDFKit.default({ margin: 40 });
      const chunks: any[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      const finished = new Promise<Buffer>((resolve, reject) => {
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err: any) => reject(err));
      });

      // Simple report header
      doc.fontSize(18).text('Export Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();

      if (activitiesRows.length) {
        doc.fontSize(14).text('Activities', { underline: true });
        doc.moveDown(0.3);
        activitiesRows.forEach(r => {
          doc.fontSize(10).text(`${r.date} • ${r.user} • ${r.project} • ${r.duration}min`);
          if (r.activity) doc.fontSize(9).fillColor('gray').text(`  ${String(r.activity).slice(0, 200)}`);
          doc.moveDown(0.2);
        });
        doc.addPageIfNeeded && doc.moveDown();
      }

      if (timesheetRows.length) {
        doc.fontSize(14).text('Timesheets', { underline: true });
        doc.moveDown(0.3);
        timesheetRows.forEach(r => {
          doc.fontSize(10).text(`${r.week} • ${r.user} • ${r.project} • ${r.hours} h`);
        });
        doc.moveDown();
      }

      if (expenseRows.length) {
        doc.fontSize(14).text('Expenses', { underline: true });
        doc.moveDown(0.3);
        expenseRows.forEach(r => {
          doc.fontSize(10).text(`${r.date} • ${r.project} • ${r.vendor} • ${r.amount} ${r.currency}`);
          if (r.receipt_link) doc.fontSize(9).fillColor('blue').text(`  Receipt: ${r.receipt_link}`);
          doc.moveDown(0.2);
        });
      }

      doc.end();
      const pdfBuffer = await finished;
      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: String(err.message ?? err) }, { status: 500 });
  }
}
