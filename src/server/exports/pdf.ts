import "server-only";
import { existsSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatDateTime } from "@/lib/dates";
import type { ColumnType, ReportTable } from "../reports/types";
import { cellText, NUMERIC_TYPES } from "./format";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const REGULAR = path.join(FONT_DIR, "NotoSans-Regular.ttf");
const BOLD = path.join(FONT_DIR, "NotoSans-Bold.ttf");

const WEIGHT: Record<ColumnType, number> = { text: 2, date: 1.1, money: 1.35, qty: 1, number: 0.8, percent: 0.9 };

/** Renders a report as an A4 PDF with repeating headers, totals, and page numbers. */
export async function reportToPdf(report: ReportTable, shopName: string): Promise<Buffer> {
  const hasRupeeFont = existsSync(REGULAR) && existsSync(BOLD);
  // The built-in Helvetica font has no rupee glyph.
  const text = (s: string) => (hasRupeeFont ? s : s.replace(/₹/g, "Rs. "));
  const landscape = report.columns.length > 6;
  const doc = new PDFDocument({
    size: "A4",
    layout: landscape ? "landscape" : "portrait",
    margin: 32,
    bufferPages: true,
    font: hasRupeeFont ? REGULAR : "Helvetica",
    info: { Title: report.title, Author: shopName, Subject: report.filterSummary },
  });
  const regular = hasRupeeFont ? "regular" : "Helvetica";
  const bold = hasRupeeFont ? "bold" : "Helvetica-Bold";
  if (hasRupeeFont) {
    doc.registerFont("regular", REGULAR);
    doc.registerFont("bold", BOLD);
  }

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottomLimit = () => doc.page.height - doc.page.margins.bottom - 24;
  const fontSize = landscape ? 7.5 : 8.5;
  const rowHeight = fontSize + 7;
  const totalWeight = report.columns.reduce((s, c) => s + WEIGHT[c.type], 0);
  const widths = report.columns.map((c) => (WEIGHT[c.type] / totalWeight) * usable);

  doc.font(bold).fontSize(14).text(text(shopName));
  doc.fontSize(12).text(text(report.title));
  doc.font(regular).fontSize(9).fillColor("#444444");
  doc.text(text(`Filters: ${report.filterSummary}`));
  doc.text(`Generated: ${formatDateTime(report.generatedAt)} (IST)`);
  doc.fillColor("black").moveDown(0.6);

  const drawRow = (cells: string[], options: { bold?: boolean; fill?: string; topRule?: boolean }) => {
    if (doc.y + rowHeight > bottomLimit()) {
      doc.addPage();
      drawHeader();
    }
    const y = doc.y;
    if (options.fill) doc.rect(left, y, usable, rowHeight).fill(options.fill).fillColor("black");
    if (options.topRule) doc.moveTo(left, y).lineTo(left + usable, y).lineWidth(0.7).stroke();
    doc.font(options.bold ? bold : regular).fontSize(fontSize);
    let x = left;
    cells.forEach((cell, i) => {
      const numeric = NUMERIC_TYPES.includes(report.columns[i].type);
      doc.text(text(cell), x + 3, y + 3.5, {
        width: widths[i] - 6,
        height: rowHeight,
        align: numeric ? "right" : "left",
        lineBreak: false,
        ellipsis: true,
      });
      x += widths[i];
    });
    doc.x = left;
    doc.y = y + rowHeight;
  };

  const drawHeader = () => drawRow(report.columns.map((c) => c.label), { bold: true, fill: "#E5E7EB" });

  drawHeader();
  report.rows.forEach((row, index) => {
    drawRow(
      report.columns.map((c) => cellText(row[c.key], c.type)),
      { fill: index % 2 === 1 ? "#F7F7F8" : undefined },
    );
  });
  if (report.rows.length === 0) drawRow(["No data for these filters.", ...report.columns.slice(1).map(() => "")], {});
  if (report.totals) {
    const totals = report.totals;
    drawRow(
      report.columns.map((c, i) => {
        if (i === 0) return String(totals._label ?? "Total");
        const v = totals[c.key];
        return typeof v === "string" ? v : cellText(v, c.type);
      }),
      { bold: true, topRule: true },
    );
  }

  if (report.notes.length) {
    doc.moveDown(0.8).font(regular).fontSize(8).fillColor("#555555");
    for (const note of report.notes) doc.text(text(note), left, doc.y, { width: usable });
    doc.fillColor("black");
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Text below the bottom margin makes PDFKit add a page, so lift the margin for the footer.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(regular).fontSize(7.5).fillColor("#666666");
    doc.text(`${report.title} · Page ${i + 1} of ${range.count}`, left, doc.page.height - bottom - 10, {
      width: usable,
      align: "center",
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return finished;
}
