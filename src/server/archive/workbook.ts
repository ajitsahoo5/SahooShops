import "server-only";
import ExcelJS from "exceljs";
import { formatDateTime } from "@/lib/dates";
import type { ArchiveBatchDoc, PurchaseDoc, SaleDoc, WithId } from "../types";

export const SALES_SHEET = "Sales";
export const PURCHASES_SHEET = "Purchases";

export interface ParsedArchive {
  batchId: string;
  saleIds: string[];
  purchaseIds: string[];
  salesTotalPaise: number;
  purchasesTotalPaise: number;
}

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number | null)[][]) {
  const sheet = workbook.addWorksheet(name);
  const header = sheet.addRow(headers);
  header.font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  headers.forEach((h, i) => (sheet.getColumn(i + 1).width = Math.min(Math.max(h.length + 2, 12), 40)));
  return sheet;
}

/**
 * Builds the archive workbook. Money columns hold exact integer paise so the file can be
 * verified against Firestore without rounding differences.
 */
export async function buildArchiveWorkbook(
  batchId: string,
  batch: Pick<ArchiveBatchDoc, "cutoffDate" | "createdAt">,
  sales: WithId<SaleDoc>[],
  purchases: WithId<PurchaseDoc>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sahoo Shop";
  workbook.created = new Date();

  const salesTotal = sales.reduce((s, x) => s + x.totals.totalPaise, 0);
  const purchasesTotal = purchases.reduce((s, x) => s + x.totals.totalPaise, 0);
  addSheet(
    workbook,
    "Summary",
    ["Field", "Value"],
    [
      ["Archive batch", batchId],
      ["Transactions dated before", batch.cutoffDate],
      ["Batch created", formatDateTime(batch.createdAt)],
      ["Workbook generated", formatDateTime(new Date())],
      ["Sales count", sales.length],
      ["Sales total (paise)", salesTotal],
      ["Purchases count", purchases.length],
      ["Purchases total (paise)", purchasesTotal],
      ["Note", "Amounts are integer paise (100 paise = 1 rupee). Records remain in Sahoo Shop, marked as archived."],
    ],
  );

  addSheet(
    workbook,
    SALES_SHEET,
    [
      "Sale ID", "Number", "Date", "Customer", "Status", "Total (paise)", "Paid (paise)", "Due (paise)",
      "Returned (paise)", "Refunded (paise)", "Cost of goods (paise)", "Returned cost (paise)", "Items", "Posted at",
      "Reversed at", "Reversal reason", "Notes",
    ],
    sales.map((s) => [
      s.id, s.number, s.businessDate, s.customerName ?? "Walk-in", s.status, s.totals.totalPaise, s.paidPaise, s.duePaise,
      s.returnedPaise, s.refundedPaise, s.costOfGoodsPaise, s.returnedCogsPaise, s.items.length, s.postedAt, s.reversedAt,
      s.reversalReason, s.notes,
    ]),
  );
  addSheet(
    workbook,
    "Sale items",
    [
      "Sale ID", "Number", "Line", "SKU", "Product", "Qty (milli)", "Unit price (paise)", "Discount (paise)",
      "Net (paise)", "Cost of goods (paise)", "Returned qty (milli)",
    ],
    sales.flatMap((s) =>
      s.items.map((l, i) => [
        s.id, s.number, i + 1, l.sku, l.name, l.qtyMilli, l.unitPricePaise, l.discountPaise, l.netPaise, l.costOfGoodsPaise,
        l.returnedQtyMilli,
      ]),
    ),
  );
  addSheet(
    workbook,
    PURCHASES_SHEET,
    [
      "Purchase ID", "Number", "Date", "Supplier", "Supplier bill", "Status", "Total (paise)", "Paid (paise)",
      "Due (paise)", "Refunded (paise)", "Items", "Posted at", "Reversed at", "Reversal reason", "Notes",
    ],
    purchases.map((p) => [
      p.id, p.number, p.businessDate, p.supplierName, p.supplierInvoiceNo, p.status, p.totals.totalPaise, p.paidPaise,
      p.duePaise, p.refundedPaise, p.items.length, p.postedAt, p.reversedAt, p.reversalReason, p.notes,
    ]),
  );
  addSheet(
    workbook,
    "Purchase items",
    ["Purchase ID", "Number", "Line", "SKU", "Product", "Qty (milli)", "Unit cost (paise)", "Discount (paise)", "Net (paise)"],
    purchases.flatMap((p) =>
      p.items.map((l, i) => [p.id, p.number, i + 1, l.sku, l.name, l.qtyMilli, l.unitPricePaise, l.discountPaise, l.netPaise]),
    ),
  );

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function readIdsAndTotal(sheet: ExcelJS.Worksheet | undefined, totalColumn: number): { ids: string[]; total: number } {
  if (!sheet) throw new Error("Archive workbook is missing a sheet.");
  const ids: string[] = [];
  let total = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const id = row.getCell(1).value;
    const amount = row.getCell(totalColumn).value;
    if (typeof id !== "string" || typeof amount !== "number" || !Number.isSafeInteger(amount)) {
      throw new Error(`Invalid archive row ${rowNumber} in ${sheet.name}.`);
    }
    ids.push(id);
    total += amount;
  });
  return { ids, total };
}

/** Re-reads an archive workbook so its contents can be compared with Firestore. */
export async function parseArchiveWorkbook(buffer: Buffer): Promise<ParsedArchive> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const summary = workbook.getWorksheet("Summary");
  const batchId = summary?.getRow(2).getCell(2).value;
  const sales = readIdsAndTotal(workbook.getWorksheet(SALES_SHEET), 6);
  const purchases = readIdsAndTotal(workbook.getWorksheet(PURCHASES_SHEET), 7);
  return {
    batchId: typeof batchId === "string" ? batchId : "",
    saleIds: sales.ids,
    purchaseIds: purchases.ids,
    salesTotalPaise: sales.total,
    purchasesTotalPaise: purchases.total,
  };
}
