import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { reportToXlsx } from "@/server/exports/excel";
import { reportToPdf } from "@/server/exports/pdf";
import type { ReportTable } from "@/server/reports/types";

const report: ReportTable = {
  id: "sales",
  title: "Sales report",
  filterSummary: "01/10/2026 to 23/10/2026",
  columns: [
    { key: "date", label: "Date", type: "date" },
    { key: "number", label: "Invoice", type: "text" },
    { key: "qty", label: "Qty", type: "qty" },
    { key: "total", label: "Total", type: "money" },
  ],
  rows: Array.from({ length: 120 }, (_, i) => ({
    date: "2026-10-05",
    number: `INV-${String(i + 1).padStart(6, "0")}`,
    qty: 1250,
    total: 123456,
  })),
  totals: { _label: "120 invoices", total: 120 * 123456 },
  generatedAt: "2026-10-23T10:00:00.000Z",
  notes: ["Reversed invoices are listed with zero amounts."],
};

describe("exports", () => {
  it("writes an Excel workbook with headers, typed values, and totals", async () => {
    const buffer = await reportToXlsx(report, "Sahoo Shop");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = wb.worksheets[0];
    expect(sheet.getCell("A1").value).toBe("Sahoo Shop: Sales report");
    expect(String(sheet.getCell("A2").value)).toContain("01/10/2026 to 23/10/2026");
    expect(sheet.getRow(5).values).toEqual([undefined, "Date", "Invoice", "Qty", "Total"]);
    expect(sheet.getCell("C6").value).toBe(1.25);
    expect(sheet.getCell("D6").value).toBe(1234.56);
    expect((sheet.getCell("A6").value as Date).toISOString()).toBe("2026-10-05T00:00:00.000Z");
    const totalRow = sheet.getRow(5 + 120 + 1);
    expect(totalRow.getCell(1).value).toBe("120 invoices");
    expect(totalRow.getCell(4).value).toBe(148147.2);
  });

  it("writes a paginated PDF with the embedded rupee font", async () => {
    const buffer = await reportToPdf(report, "Sahoo Shop");
    const text = buffer.toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toContain("NotoSans");
    const pages = text.match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;
    expect(pages).toBeGreaterThanOrEqual(2);
    expect(pages).toBeLessThanOrEqual(4);
  });
});
