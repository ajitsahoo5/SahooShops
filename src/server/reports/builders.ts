import "server-only";
import type { Query } from "firebase-admin/firestore";
import { formatDisplayDate } from "@/lib/dates";
import { grossProfit } from "@/lib/invoice-math";
import { formatRupeesPlain } from "@/lib/money";
import { lineAmount } from "@/lib/qty";
import { COL, col, nowIso, withId } from "../collections";
import { listExpenses } from "../expenses/service";
import { db } from "../firebaseAdmin";
import { averageUnitCost } from "../inventory/costing";
import { listInvoices } from "../invoices/queries";
import { listParties } from "../parties/service";
import { listPayments } from "../payments/service";
import { listCategories } from "../products/categories";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type ProductDoc,
  type PurchaseDoc,
  type SaleDoc,
  type SaleReturnDoc,
  type WithId,
} from "../types";
import { getSummaries, productSalesOf, summarize } from "./summaries";
import { REPORT_META, type ReportCell, type ReportColumn, type ReportFilters, type ReportId, type ReportTable } from "./types";

const REPORT_ROW_LIMIT = 5000;

function rangeText(f: ReportFilters, archived = false): string {
  return `${formatDisplayDate(f.from)} to ${formatDisplayDate(f.to)}${archived && f.includeArchived ? " (including archived)" : ""}`;
}

function table(
  id: ReportId,
  filterSummary: string,
  columns: ReportColumn[],
  rows: Record<string, ReportCell>[],
  totals: Record<string, ReportCell> | null,
  notes: string[] = [],
): ReportTable {
  return { id, title: REPORT_META[id].title, filterSummary, columns, rows, totals, generatedAt: nowIso(), notes };
}

function sumBy(rows: Record<string, ReportCell>[], key: string): number {
  return rows.reduce((s, r) => s + (typeof r[key] === "number" ? (r[key] as number) : 0), 0);
}

function totalsFor(rows: Record<string, ReportCell>[], label: string, keys: string[]): Record<string, ReportCell> {
  return { _label: label, ...Object.fromEntries(keys.map((k) => [k, sumBy(rows, k)])) };
}

async function allProducts(): Promise<WithId<ProductDoc>[]> {
  const snap = await col(COL.products).where("active", "==", true).orderBy("nameLower").limit(REPORT_ROW_LIMIT).get();
  return snap.docs.map((d) => withId<ProductDoc>(d));
}

async function productsById(ids: string[]): Promise<Map<string, ProductDoc>> {
  const out = new Map<string, ProductDoc>();
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => col(COL.products).doc(id));
    if (refs.length === 0) continue;
    const snaps = await db().getAll(...refs);
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as ProductDoc);
  }
  return out;
}

async function salesReport(f: ReportFilters): Promise<ReportTable> {
  const sales = (await listInvoices<SaleDoc>(COL.sales, { ...f, limit: REPORT_ROW_LIMIT })).filter((s) => s.status !== "draft");
  const rows = sales.map((s) => {
    const active = s.status === "posted";
    return {
      date: s.businessDate,
      number: s.number,
      party: s.customerName ?? "Walk-in",
      status: s.status === "reversed" ? "Reversed" : s.archived ? "Posted (archived)" : "Posted",
      total: active ? s.totals.totalPaise : 0,
      returned: active ? s.returnedPaise : 0,
      cogs: active ? s.costOfGoodsPaise - s.returnedCogsPaise : 0,
      profit: active
        ? grossProfit({
            salesPaise: s.totals.totalPaise,
            returnsPaise: s.returnedPaise,
            cogsPaise: s.costOfGoodsPaise,
            returnsCogsPaise: s.returnedCogsPaise,
          })
        : 0,
      paid: s.paidPaise - s.refundedPaise,
      due: s.duePaise,
    };
  });
  return table(
    "sales",
    rangeText(f, true),
    [
      { key: "date", label: "Date", type: "date" },
      { key: "number", label: "Invoice", type: "text" },
      { key: "party", label: "Customer", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "total", label: "Total", type: "money" },
      { key: "returned", label: "Returned", type: "money" },
      { key: "cogs", label: "Cost of goods", type: "money" },
      { key: "profit", label: "Gross profit", type: "money" },
      { key: "paid", label: "Net paid", type: "money" },
      { key: "due", label: "Due", type: "money" },
    ],
    rows,
    totalsFor(rows, `${rows.length} invoices`, ["total", "returned", "cogs", "profit", "paid", "due"]),
    ["Reversed invoices are listed with zero amounts."],
  );
}

async function purchasesReport(f: ReportFilters): Promise<ReportTable> {
  const purchases = (await listInvoices<PurchaseDoc>(COL.purchases, { ...f, limit: REPORT_ROW_LIMIT })).filter(
    (p) => p.status !== "draft",
  );
  const rows = purchases.map((p) => ({
    date: p.businessDate,
    number: p.number,
    party: p.supplierName,
    bill: p.supplierInvoiceNo || null,
    status: p.status === "reversed" ? "Reversed" : p.archived ? "Posted (archived)" : "Posted",
    total: p.status === "posted" ? p.totals.totalPaise : 0,
    paid: p.paidPaise - p.refundedPaise,
    due: p.duePaise,
  }));
  return table(
    "purchases",
    rangeText(f, true),
    [
      { key: "date", label: "Date", type: "date" },
      { key: "number", label: "Purchase", type: "text" },
      { key: "party", label: "Supplier", type: "text" },
      { key: "bill", label: "Supplier bill", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "total", label: "Total", type: "money" },
      { key: "paid", label: "Net paid", type: "money" },
      { key: "due", label: "Due", type: "money" },
    ],
    rows,
    totalsFor(rows, `${rows.length} purchases`, ["total", "paid", "due"]),
  );
}

async function transactionsReport(f: ReportFilters): Promise<ReportTable> {
  const [sales, purchases, returnsSnap, payments, expenses] = await Promise.all([
    listInvoices<SaleDoc>(COL.sales, { ...f, limit: REPORT_ROW_LIMIT }),
    listInvoices<PurchaseDoc>(COL.purchases, { ...f, limit: REPORT_ROW_LIMIT }),
    col(COL.salesReturns).where("businessDate", ">=", f.from).where("businessDate", "<=", f.to).limit(REPORT_ROW_LIMIT).get(),
    listPayments({ from: f.from, to: f.to, limit: REPORT_ROW_LIMIT }),
    listExpenses({ from: f.from, to: f.to, limit: REPORT_ROW_LIMIT }),
  ]);
  type Row = Record<string, ReportCell> & { sortKey: string };
  const rows: Row[] = [];
  for (const s of sales) {
    if (s.status === "draft") continue;
    rows.push({
      sortKey: `${s.businessDate}|${s.createdAt}`,
      date: s.businessDate,
      type: "Sale",
      reference: s.number,
      party: s.customerName ?? "Walk-in",
      details: `${s.items.length} item(s)`,
      status: s.status,
      amount: s.totals.totalPaise,
    });
  }
  for (const p of purchases) {
    if (p.status === "draft") continue;
    rows.push({
      sortKey: `${p.businessDate}|${p.createdAt}`,
      date: p.businessDate,
      type: "Purchase",
      reference: p.number,
      party: p.supplierName,
      details: `${p.items.length} item(s)`,
      status: p.status,
      amount: p.totals.totalPaise,
    });
  }
  for (const d of returnsSnap.docs) {
    const r = d.data() as SaleReturnDoc;
    rows.push({
      sortKey: `${r.businessDate}|${r.createdAt}`,
      date: r.businessDate,
      type: "Sales return",
      reference: `${r.number} (${r.saleNumber})`,
      party: r.customerName ?? "Walk-in",
      details: r.reason,
      status: "posted",
      amount: r.totalPaise,
    });
  }
  const kindLabel = { receipt: "Payment received", payment: "Payment made", refund: "Refund", reversal: "Payment reversal" };
  for (const p of payments) {
    rows.push({
      sortKey: `${p.businessDate}|${p.createdAt}`,
      date: p.businessDate,
      type: `${kindLabel[p.kind]} (${p.direction === "in" ? "in" : "out"})`,
      reference: p.allocations.map((a) => a.number).join(", ") || null,
      party: p.partyName ?? "Walk-in",
      details: PAYMENT_METHOD_LABELS[p.method],
      status: p.status,
      amount: p.amountPaise,
    });
  }
  for (const e of expenses) {
    rows.push({
      sortKey: `${e.businessDate}|${e.createdAt}`,
      date: e.businessDate,
      type: "Expense",
      reference: e.categoryName,
      party: null,
      details: e.description || PAYMENT_METHOD_LABELS[e.method],
      status: e.status,
      amount: e.amountPaise,
    });
  }
  rows.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  for (const row of rows) delete (row as Partial<Row>).sortKey;
  return table(
    "transactions",
    rangeText(f, true),
    [
      { key: "date", label: "Date", type: "date" },
      { key: "type", label: "Type", type: "text" },
      { key: "reference", label: "Reference", type: "text" },
      { key: "party", label: "Party", type: "text" },
      { key: "details", label: "Details", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
    ],
    rows,
    null,
    [`${rows.length} entries. Amounts are shown as recorded; see status for reversed or voided entries.`],
  );
}

async function stockReport(): Promise<ReportTable> {
  const [products, categories] = await Promise.all([allProducts(), listCategories()]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  const statusLabel = { ok: "In stock", low: "Low stock", out: "Out of stock" };
  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.categoryId ? catName.get(p.categoryId) ?? null : null,
    unit: p.unit,
    qty: p.stockQtyMilli,
    reorder: p.reorderLevelMilli,
    status: statusLabel[p.stockStatus],
  }));
  return table(
    "stock",
    "Current stock of active products",
    [
      { key: "sku", label: "SKU", type: "text" },
      { key: "name", label: "Product", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "qty", label: "On hand", type: "qty" },
      { key: "reorder", label: "Reorder level", type: "qty" },
      { key: "status", label: "Status", type: "text" },
    ],
    rows,
    {
      _label: `${rows.length} products`,
      status: `${products.filter((p) => p.stockStatus === "low").length} low, ${products.filter((p) => p.stockStatus === "out").length} out`,
    },
  );
}

async function valuationReport(): Promise<ReportTable> {
  const products = await allProducts();
  const rows = products.map((p) => ({
    sku: p.sku,
    name: p.name,
    qty: p.stockQtyMilli,
    unit: p.unit,
    avgCost: averageUnitCost({ qtyMilli: p.stockQtyMilli, valuePaise: p.stockValuePaise, lastCostPaise: p.purchaseCostPaise }),
    value: p.stockValuePaise,
    price: p.sellingPricePaise,
    retailValue: p.stockQtyMilli > 0 ? lineAmount(p.stockQtyMilli, p.sellingPricePaise) : 0,
  }));
  return table(
    "valuation",
    "Weighted-average cost of stock on hand",
    [
      { key: "sku", label: "SKU", type: "text" },
      { key: "name", label: "Product", type: "text" },
      { key: "qty", label: "On hand", type: "qty" },
      { key: "unit", label: "Unit", type: "text" },
      { key: "avgCost", label: "Average cost", type: "money" },
      { key: "value", label: "Stock value", type: "money" },
      { key: "price", label: "Selling price", type: "money" },
      { key: "retailValue", label: "Retail value", type: "money" },
    ],
    rows,
    totalsFor(rows, `${rows.length} products`, ["value", "retailValue"]),
  );
}

async function expensesReport(f: ReportFilters): Promise<ReportTable> {
  const expenses = (await listExpenses({ from: f.from, to: f.to, limit: REPORT_ROW_LIMIT })).filter((e) => e.status === "active");
  const rows = expenses
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
    .map((e) => ({
      date: e.businessDate,
      category: e.categoryName,
      description: e.description || null,
      method: PAYMENT_METHOD_LABELS[e.method],
      amount: e.amountPaise,
    }));
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + e.amountPaise);
  return table(
    "expenses",
    rangeText(f),
    [
      { key: "date", label: "Date", type: "date" },
      { key: "category", label: "Category", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "method", label: "Paid by", type: "text" },
      { key: "amount", label: "Amount", type: "money" },
    ],
    rows,
    totalsFor(rows, `${rows.length} expenses`, ["amount"]),
    [...byCategory.entries()].map(([name, amount]) => `${name}: Rs. ${formatRupeesPlain(amount)}`),
  );
}

async function profitabilityReport(f: ReportFilters): Promise<ReportTable> {
  const summaries = await getSummaries(f.from, f.to);
  const rows = summaries.map((s) => {
    const t = summarize([s]);
    return {
      date: s.date,
      sales: t.salesPaise,
      returns: t.returnsPaise,
      netSales: t.netSalesPaise,
      cogs: t.cogsPaise,
      grossProfit: t.grossProfitPaise,
      expenses: t.expensesPaise,
      operatingProfit: t.operatingProfitPaise,
    };
  });
  const total = summarize(summaries);
  return table(
    "profitability",
    rangeText(f),
    [
      { key: "date", label: "Date", type: "date" },
      { key: "sales", label: "Sales", type: "money" },
      { key: "returns", label: "Returns", type: "money" },
      { key: "netSales", label: "Net sales", type: "money" },
      { key: "cogs", label: "Cost of goods", type: "money" },
      { key: "grossProfit", label: "Gross profit", type: "money" },
      { key: "expenses", label: "Expenses", type: "money" },
      { key: "operatingProfit", label: "Operating profit", type: "money" },
    ],
    rows,
    {
      _label: "Total",
      sales: total.salesPaise,
      returns: total.returnsPaise,
      netSales: total.netSalesPaise,
      cogs: total.cogsPaise,
      grossProfit: total.grossProfitPaise,
      expenses: total.expensesPaise,
      operatingProfit: total.operatingProfitPaise,
    },
    [
      "Gross profit = net sales minus weighted-average cost of goods sold.",
      "Operating profit is an estimate: gross profit minus recorded expenses.",
    ],
  );
}

async function productSalesReport(f: ReportFilters): Promise<ReportTable> {
  const summaries = await getSummaries(f.from, f.to);
  const totals = productSalesOf(summaries);
  const products = await productsById([...totals.keys()]);
  const rows = [...totals.entries()]
    .filter(([, e]) => e.qtyMilli !== 0 || e.revenuePaise !== 0)
    .map(([id, e]) => {
      const p = products.get(id);
      const profit = e.revenuePaise - e.cogsPaise;
      return {
        sku: p?.sku ?? id,
        name: p?.name ?? "(deleted product)",
        qty: e.qtyMilli,
        revenue: e.revenuePaise,
        cogs: e.cogsPaise,
        profit,
        margin: e.revenuePaise ? Math.round((profit / e.revenuePaise) * 10000) / 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
  return table(
    "product-sales",
    rangeText(f),
    [
      { key: "sku", label: "SKU", type: "text" },
      { key: "name", label: "Product", type: "text" },
      { key: "qty", label: "Qty sold", type: "qty" },
      { key: "revenue", label: "Net revenue", type: "money" },
      { key: "cogs", label: "Cost of goods", type: "money" },
      { key: "profit", label: "Gross profit", type: "money" },
      { key: "margin", label: "Margin %", type: "percent" },
    ],
    rows,
    totalsFor(rows, `${rows.length} products`, ["revenue", "cogs", "profit"]),
    ["Net of returns. Sorted by revenue, highest first."],
  );
}

async function cashMovementReport(f: ReportFilters): Promise<ReportTable> {
  const summaries = await getSummaries(f.from, f.to);
  const rows = summaries.map((s) => {
    const row: Record<string, ReportCell> = { date: s.date };
    let net = 0;
    for (const m of PAYMENT_METHODS) {
      row[`in_${m}`] = s.cashIn[m] ?? 0;
      row[`out_${m}`] = s.cashOut[m] ?? 0;
      net += (s.cashIn[m] ?? 0) - (s.cashOut[m] ?? 0);
    }
    row.net = net;
    return row;
  });
  const keys = [...PAYMENT_METHODS.flatMap((m) => [`in_${m}`, `out_${m}`]), "net"];
  return table(
    "cash-movement",
    rangeText(f),
    [
      { key: "date", label: "Date", type: "date" },
      ...PAYMENT_METHODS.flatMap((m) => [
        { key: `in_${m}`, label: `${PAYMENT_METHOD_LABELS[m]} in`, type: "money" as const },
        { key: `out_${m}`, label: `${PAYMENT_METHOD_LABELS[m]} out`, type: "money" as const },
      ]),
      { key: "net", label: "Net", type: "money" },
    ],
    rows,
    totalsFor(rows, "Total", keys),
    ["Includes sales receipts, supplier payments, refunds, and expenses. Reversed payments are removed from their original day."],
  );
}

async function balancesReport(): Promise<ReportTable> {
  const [customers, suppliers] = await Promise.all([
    listParties("customer", { withBalanceOnly: true }),
    listParties("supplier", { withBalanceOnly: true }),
  ]);
  const rows = [
    ...customers.map((c) => ({ type: "Customer (receivable)", name: c.name, phone: c.phone || null, receivable: c.balancePaise, payable: 0 })),
    ...suppliers.map((s) => ({ type: "Supplier (payable)", name: s.name, phone: s.phone || null, receivable: 0, payable: s.balancePaise })),
  ];
  return table(
    "balances",
    "Outstanding balances as of now",
    [
      { key: "type", label: "Type", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "receivable", label: "Receivable", type: "money" },
      { key: "payable", label: "Payable", type: "money" },
    ],
    rows,
    totalsFor(rows, "Total", ["receivable", "payable"]),
  );
}

async function archivedReport(f: ReportFilters): Promise<ReportTable> {
  const query = (name: typeof COL.sales | typeof COL.purchases): Query =>
    col(name)
      .where("archived", "==", true)
      .where("businessDate", ">=", f.from)
      .where("businessDate", "<=", f.to)
      .orderBy("businessDate", "desc")
      .limit(REPORT_ROW_LIMIT);
  const [salesSnap, purchasesSnap] = await Promise.all([query(COL.sales).get(), query(COL.purchases).get()]);
  const rows = [
    ...salesSnap.docs.map((d) => {
      const s = d.data() as SaleDoc;
      return {
        type: "Sale",
        date: s.businessDate,
        number: s.number,
        party: s.customerName ?? "Walk-in",
        status: s.status,
        total: s.totals.totalPaise,
        due: s.duePaise,
        archivedAt: s.archivedAt?.slice(0, 10) ?? null,
        batch: s.archiveBatchId,
      };
    }),
    ...purchasesSnap.docs.map((d) => {
      const p = d.data() as PurchaseDoc;
      return {
        type: "Purchase",
        date: p.businessDate,
        number: p.number,
        party: p.supplierName,
        status: p.status,
        total: p.totals.totalPaise,
        due: p.duePaise,
        archivedAt: p.archivedAt?.slice(0, 10) ?? null,
        batch: p.archiveBatchId,
      };
    }),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return table(
    "archived",
    rangeText(f),
    [
      { key: "type", label: "Type", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "number", label: "Number", type: "text" },
      { key: "party", label: "Party", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "total", label: "Total", type: "money" },
      { key: "due", label: "Due", type: "money" },
      { key: "archivedAt", label: "Archived on", type: "date" },
      { key: "batch", label: "Archive batch", type: "text" },
    ],
    rows,
    totalsFor(rows, `${rows.length} transactions`, ["total", "due"]),
  );
}

export async function buildReport(id: ReportId, filters: ReportFilters): Promise<ReportTable> {
  switch (id) {
    case "sales":
      return salesReport(filters);
    case "purchases":
      return purchasesReport(filters);
    case "transactions":
      return transactionsReport(filters);
    case "stock":
      return stockReport();
    case "valuation":
      return valuationReport();
    case "expenses":
      return expensesReport(filters);
    case "profitability":
      return profitabilityReport(filters);
    case "product-sales":
      return productSalesReport(filters);
    case "cash-movement":
      return cashMovementReport(filters);
    case "balances":
      return balancesReport();
    case "archived":
      return archivedReport(filters);
  }
}
