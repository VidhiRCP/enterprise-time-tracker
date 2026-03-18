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
  if (types.length === 0) return "all";
  const names = types.map((t) => {
    if (t === "activities") return "activities";
    if (t === "timesheets") return "timesheets";
    if (t === "expenses") return "expenses";
    return t;
  });
  return names.sort().join("_");
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

    /* ── PDF (using pdf-lib — works in serverless without .afm files) ── */
    if (format === "pdf") {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      const MARGIN = 40;
      const ROW_H = 16;
      const HDR_H = 20;
      const PAGE_W = 841.89; // A4 landscape
      const PAGE_H = 595.28;
      const usable = PAGE_W - MARGIN * 2;

      let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      let curY = PAGE_H - MARGIN;

      /* ── Title ── */
      const titleW = fontBold.widthOfTextAtSize("Export Report", 18);
      page.drawText("Export Report", {
        x: (PAGE_W - titleW) / 2,
        y: curY,
        size: 18,
        font: fontBold,
        color: rgb(0.15, 0.15, 0.15),
      });
      curY -= 16;
      const subW = font.widthOfTextAtSize(`Generated: ${todayStr}`, 9);
      page.drawText(`Generated: ${todayStr}`, {
        x: (PAGE_W - subW) / 2,
        y: curY,
        size: 9,
        font,
        color: rgb(0.5, 0.5, 0.5),
      });
      curY -= 28;

      function ensureSpace(needed: number) {
        if (curY - needed < MARGIN) {
          page = pdfDoc.addPage([PAGE_W, PAGE_H]);
          curY = PAGE_H - MARGIN;
        }
      }

      function drawTable(title: string, headers: string[], rows: string[][]) {
        ensureSpace(HDR_H + ROW_H + 30);

        /* section title */
        page.drawText(title, {
          x: MARGIN,
          y: curY,
          size: 13,
          font: fontBold,
          color: rgb(0.1, 0.1, 0.1),
        });
        curY -= 6;
        page.drawLine({
          start: { x: MARGIN, y: curY },
          end: { x: PAGE_W - MARGIN, y: curY },
          thickness: 0.5,
          color: rgb(0.3, 0.3, 0.3),
        });
        curY -= 4;

        const colCount = headers.length;
        const colWidth = usable / colCount;

        /* header row background */
        page.drawRectangle({
          x: MARGIN,
          y: curY - HDR_H + 2,
          width: usable,
          height: HDR_H,
          color: rgb(0.2, 0.2, 0.2),
        });

        headers.forEach((h, i) => {
          const truncated = truncText(h, fontBold, 8, colWidth - 8);
          page.drawText(truncated, {
            x: MARGIN + i * colWidth + 4,
            y: curY - HDR_H + 8,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
        });
        curY -= HDR_H + 2;

        /* data rows */
        rows.forEach((row, ri) => {
          ensureSpace(ROW_H + 4);

          /* zebra stripe */
          if (ri % 2 === 0) {
            page.drawRectangle({
              x: MARGIN,
              y: curY - ROW_H + 2,
              width: usable,
              height: ROW_H,
              color: rgb(0.96, 0.96, 0.96),
            });
          }

          row.forEach((cell, ci) => {
            const truncated = truncText(String(cell ?? ""), font, 7.5, colWidth - 8);
            page.drawText(truncated, {
              x: MARGIN + ci * colWidth + 4,
              y: curY - ROW_H + 6,
              size: 7.5,
              font,
              color: rgb(0.1, 0.1, 0.1),
            });
          });
          curY -= ROW_H;
        });
        curY -= 16;
      }

      /* truncate text to fit in column */
      function truncText(text: string, f: typeof font, size: number, maxW: number): string {
        if (!text) return "";
        let t = text.replace(/[\n\r]/g, " ");
        try {
          if (f.widthOfTextAtSize(t, size) <= maxW) return t;
          while (t.length > 1 && f.widthOfTextAtSize(t + "…", size) > maxW) {
            t = t.slice(0, -1);
          }
          return t + "…";
        } catch {
          return t.slice(0, 30);
        }
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

      const pdfBytes = await pdfDoc.save();
      return new NextResponse(Buffer.from(pdfBytes), {
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
