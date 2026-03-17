import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfWeek } from "date-fns";

/* ── Helpers ── */

function fmtDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${dt.getFullYear()}`;
}

function fmtDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function exportTypeLabel(types: string[]): string {
  if (types.length === 0) return "combo";
  const sorted = [...types].sort();
  if (sorted.length === 1) {
    if (sorted[0] === "activities") return "activity";
    if (sorted[0] === "timesheets") return "timesheet";
    if (sorted[0] === "expenses") return "expenses";
    return sorted[0];
  }
  return "combo";
}

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
  const lines = rows.map((r) =>
    headers.map((h) => esc((r as any)[h] ?? "")).join(",")
  );
  return [headerLine, ...lines].join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const types: string[] = body.type ?? [];
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    const project = body.project ?? null;
    const userEmail = body.user ?? null;
    const format = (body.format ?? "csv").toLowerCase();

    const activitiesRows: Array<Record<string, any>> = [];
    const timesheetRows: Array<Record<string, any>> = [];
    const expenseRows: Array<Record<string, any>> = [];

    /* ── Activities ── */
    if (
      types.includes("activities") ||
      types.includes("all") ||
      types.length === 0
    ) {
      const where: any = {};
      if (startDate || endDate) where.workDate = {};
      if (startDate) where.workDate.gte = startDate;
      if (endDate) where.workDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({
          where: { email: String(userEmail).toLowerCase() },
        });
        if (u) where.userId = u.id;
      }
      const entries = await prisma.timeEntry.findMany({
        where,
        include: { project: true, user: true },
        orderBy: { workDate: "desc" },
      });
      for (const e of entries) {
        activitiesRows.push({
          Date: fmtDate(e.workDate),
          Email: e.user?.email ?? "",
          "Project Name - ID": e.project
            ? `${e.project.projectName} - ${e.project.projectId}`
            : "",
          Activity: e.notes ?? "",
          Duration: fmtDuration(e.durationMinutes),
        });
      }
    }

    /* ── Timesheets ── */
    if (types.includes("timesheets") || types.includes("all")) {
      const where: any = {};
      if (startDate || endDate) where.workDate = {};
      if (startDate) where.workDate.gte = startDate;
      if (endDate) where.workDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({
          where: { email: String(userEmail).toLowerCase() },
        });
        if (u) where.userId = u.id;
      }
      const entries = await prisma.timeEntry.findMany({
        where,
        include: { project: true, user: true },
      });
      const map = new Map<
        string,
        { week: string; user: string; project: string; minutes: number }
      >();
      for (const e of entries) {
        const ws = startOfWeek(e.workDate, { weekStartsOn: 1 });
        const wsKey = ws.toISOString().slice(0, 10);
        const key = `${wsKey}:${e.userId}:${e.projectId}`;
        const existing = map.get(key) ?? {
          week: wsKey,
          user: e.user?.email ?? "",
          project: e.project
            ? `${e.project.projectName} - ${e.project.projectId}`
            : "",
          minutes: 0,
        };
        existing.minutes += e.durationMinutes;
        map.set(key, existing);
      }
      for (const r of Array.from(map.values())) {
        timesheetRows.push({
          "Week Starting": fmtDate(new Date(r.week + "T00:00:00")),
          Email: r.user,
          "Project Name - ID": r.project,
          Duration: fmtDuration(r.minutes),
        });
      }
    }

    /* ── Expenses ── */
    if (types.includes("expenses") || types.includes("all")) {
      const where: any = {};
      if (startDate || endDate) where.expenseDate = {};
      if (startDate) where.expenseDate.gte = startDate;
      if (endDate) where.expenseDate.lte = endDate;
      if (project) where.projectId = project;
      if (userEmail) {
        const u = await prisma.user.findUnique({
          where: { email: String(userEmail).toLowerCase() },
        });
        if (u) where.userId = u.id;
      }
      const entries = await prisma.expenseEntry.findMany({
        where,
        include: { project: true },
        orderBy: { expenseDate: "desc" },
      });
      for (const e of entries) {
        expenseRows.push({
          Date: fmtDate(e.expenseDate),
          "Project Name - ID": e.project
            ? `${e.project.projectName} - ${e.project.projectId}`
            : "",
          Vendor: e.merchant ?? "",
          Amount: String(e.amount),
          Currency: e.currency ?? "",
          Details: e.details ?? "",
          Status: "Saved",
        });
      }
    }

    const todayStr = fmtDate(new Date());
    const typeLabel = exportTypeLabel(types);
    const filenameBase = `${todayStr}_${typeLabel}`;

    /* ── CSV ── */
    if (format === "csv") {
      const sections: string[] = [];
      if (activitiesRows.length)
        sections.push(
          "== Activities ==\n" +
            buildCsv(
              ["Date", "Email", "Project Name - ID", "Activity", "Duration"],
              activitiesRows
            )
        );
      if (timesheetRows.length)
        sections.push(
          "== Timesheets ==\n" +
            buildCsv(
              ["Week Starting", "Email", "Project Name - ID", "Duration"],
              timesheetRows
            )
        );
      if (expenseRows.length)
        sections.push(
          "== Expenses ==\n" +
            buildCsv(
              [
                "Date",
                "Project Name - ID",
                "Vendor",
                "Amount",
                "Currency",
                "Details",
                "Status",
              ],
              expenseRows
            )
        );
      const content = sections.join("\n\n");
      return new NextResponse(content, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
        },
      });
    }

    /* ── XLSX ── */
    if (format === "xlsx") {
      // @ts-ignore
      const ExcelJS: any = await import("exceljs");
      const workbook = new ExcelJS.Workbook();

      if (activitiesRows.length) {
        const ws = workbook.addWorksheet("Activities");
        ws.columns = [
          { header: "Date", key: "Date", width: 14 },
          { header: "Email", key: "Email", width: 28 },
          { header: "Project Name - ID", key: "Project Name - ID", width: 30 },
          { header: "Activity", key: "Activity", width: 40 },
          { header: "Duration", key: "Duration", width: 14 },
        ];
        ws.getRow(1).font = { bold: true };
        activitiesRows.forEach((r) => ws.addRow(r));
      }
      if (timesheetRows.length) {
        const ws = workbook.addWorksheet("Timesheets");
        ws.columns = [
          { header: "Week Starting", key: "Week Starting", width: 14 },
          { header: "Email", key: "Email", width: 28 },
          { header: "Project Name - ID", key: "Project Name - ID", width: 30 },
          { header: "Duration", key: "Duration", width: 14 },
        ];
        ws.getRow(1).font = { bold: true };
        timesheetRows.forEach((r) => ws.addRow(r));
      }
      if (expenseRows.length) {
        const ws = workbook.addWorksheet("Expenses");
        ws.columns = [
          { header: "Date", key: "Date", width: 14 },
          { header: "Project Name - ID", key: "Project Name - ID", width: 30 },
          { header: "Vendor", key: "Vendor", width: 24 },
          { header: "Amount", key: "Amount", width: 12 },
          { header: "Currency", key: "Currency", width: 10 },
          { header: "Details", key: "Details", width: 36 },
          { header: "Status", key: "Status", width: 10 },
        ];
        ws.getRow(1).font = { bold: true };
        expenseRows.forEach((r) => ws.addRow(r));
      }

      const ab: ArrayBuffer = await workbook.xlsx.writeBuffer();
      const buffer = Buffer.from(ab);
      return new NextResponse(buffer as any, {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
        },
      });
    }

    /* ── PDF ── */
    if (format === "pdf") {
      // @ts-ignore
      const PDFKit: any = await import("pdfkit");
      const doc = new PDFKit.default({
        margin: 40,
        size: "A4",
        layout: "landscape",
      });
      const chunks: any[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      const finished = new Promise<Buffer>((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err: any) => reject(err));
      });

      doc.fontSize(16).fillColor("black").text("Export Report", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor("gray").text(`Generated: ${todayStr}`, { align: "center" });
      doc.moveDown(1);

      function drawTable(
        title: string,
        headers: string[],
        rows: string[][]
      ) {
        doc
          .fontSize(13)
          .fillColor("black")
          .text(title, { underline: true });
        doc.moveDown(0.4);
        const colCount = headers.length;
        const pageWidth =
          doc.page.width - doc.page.margins.left - doc.page.margins.right;
        const colWidth = pageWidth / colCount;
        const startX = doc.page.margins.left;
        let y = doc.y;

        /* header row */
        doc.rect(startX, y, pageWidth, 18).fill("#333333");
        doc.fillColor("white").fontSize(8);
        headers.forEach((h: string, i: number) => {
          doc.text(h, startX + i * colWidth + 4, y + 4, {
            width: colWidth - 8,
            lineBreak: false,
          });
        });
        y += 18;

        /* data rows */
        doc.fillColor("black").fontSize(8);
        rows.forEach((row: string[], ri: number) => {
          if (y + 16 > doc.page.height - doc.page.margins.bottom) {
            doc.addPage();
            y = doc.page.margins.top;
          }
          if (ri % 2 === 0) {
            doc.rect(startX, y, pageWidth, 16).fill("#f5f5f5");
          }
          doc.fillColor("black");
          row.forEach((cell: string, ci: number) => {
            doc.text(String(cell ?? ""), startX + ci * colWidth + 4, y + 3, {
              width: colWidth - 8,
              lineBreak: false,
            });
          });
          y += 16;
        });
        doc.y = y + 12;
        doc.moveDown(0.5);
      }

      if (activitiesRows.length) {
        const h = ["Date", "Email", "Project Name - ID", "Activity", "Duration"];
        const r = activitiesRows.map((row: Record<string, any>) =>
          h.map((k) => String(row[k] ?? ""))
        );
        drawTable("Activities", h, r);
      }
      if (timesheetRows.length) {
        const h = ["Week Starting", "Email", "Project Name - ID", "Duration"];
        const r = timesheetRows.map((row: Record<string, any>) =>
          h.map((k) => String(row[k] ?? ""))
        );
        drawTable("Timesheets", h, r);
      }
      if (expenseRows.length) {
        const h = [
          "Date",
          "Project Name - ID",
          "Vendor",
          "Amount",
          "Currency",
          "Details",
          "Status",
        ];
        const r = expenseRows.map((row: Record<string, any>) =>
          h.map((k) => String(row[k] ?? ""))
        );
        drawTable("Expenses", h, r);
      }

      doc.end();
      const pdfBuffer = await finished;
      return new NextResponse(pdfBuffer as any, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
        },
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { error: String(err.message ?? err) },
      { status: 500 }
    );
  }
}
