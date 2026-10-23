import "server-only";
import ExcelJS from "exceljs";
import { formatDateTime, isBusinessDate } from "@/lib/dates";
import type { ColumnType, ReportCell, ReportTable } from "../reports/types";

const NUMBER_FORMATS: Partial<Record<ColumnType, string>> = {
  money: '"₹"#,##0.00;[Red]-"₹"#,##0.00',
  qty: "#,##0.###",
  number: "#,##0",
  percent: '0.00"%"',
  date: "dd/mm/yyyy",
};

function excelValue(value: ReportCell | undefined, type: ColumnType): ExcelJS.CellValue {
  if (value === null || value === undefined || value === "") return null;
  if (type === "date" && typeof value === "string" && isBusinessDate(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  if (typeof value === "number") {
    if (type === "money") return value / 100;
    if (type === "qty") return value / 1000;
  }
  return value;
}

function sheetName(title: string): string {
  return title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
}

/** Renders a report as an .xlsx workbook with title, filters, generation time, data, and totals. */
export async function reportToXlsx(report: ReportTable, shopName: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = shopName;
  workbook.created = new Date(report.generatedAt);
  const sheet = workbook.addWorksheet(sheetName(report.title));

  sheet.addRow([`${shopName}: ${report.title}`]).font = { bold: true, size: 14 };
  sheet.addRow([`Filters: ${report.filterSummary}`]);
  sheet.addRow([`Generated: ${formatDateTime(report.generatedAt)} (IST)`]);
  sheet.addRow([]);

  const header = sheet.addRow(report.columns.map((c) => c.label));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    cell.border = { bottom: { style: "thin" } };
  });

  for (const row of report.rows) {
    sheet.addRow(report.columns.map((c) => excelValue(row[c.key], c.type)));
  }

  if (report.totals) {
    const totals = report.totals;
    const totalRow = sheet.addRow(
      report.columns.map((c, i) => {
        if (i === 0) return String(totals._label ?? "Total");
        const v = totals[c.key];
        return typeof v === "string" ? v : excelValue(v, c.type);
      }),
    );
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => (cell.border = { top: { style: "thin" } }));
  }

  report.columns.forEach((c, i) => {
    const column = sheet.getColumn(i + 1);
    const format = NUMBER_FORMATS[c.type];
    if (format) column.numFmt = format;
    const longest = Math.max(
      c.label.length,
      ...report.rows.slice(0, 500).map((r) => String(r[c.key] ?? "").length),
    );
    column.width = Math.min(Math.max(longest + 2, c.type === "money" ? 14 : 10), 48);
  });

  const headerRow = header.number;
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  if (report.rows.length > 0) {
    sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: report.columns.length } };
  }

  if (report.notes.length) {
    sheet.addRow([]);
    for (const note of report.notes) sheet.addRow([note]).font = { italic: true, color: { argb: "FF6B7280" } };
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
