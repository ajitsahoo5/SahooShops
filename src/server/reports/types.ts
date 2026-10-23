export type ColumnType = "text" | "money" | "qty" | "date" | "number" | "percent";

export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export type ReportCell = string | number | null;

export interface ReportTable {
  id: ReportId;
  title: string;
  /** Human-readable description of the filters, printed on every export. */
  filterSummary: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  totals: Record<string, ReportCell> | null;
  generatedAt: string;
  notes: string[];
}

export const REPORT_IDS = [
  "sales",
  "purchases",
  "transactions",
  "stock",
  "valuation",
  "expenses",
  "profitability",
  "product-sales",
  "cash-movement",
  "balances",
  "archived",
] as const;

export type ReportId = (typeof REPORT_IDS)[number];

export interface ReportFilters {
  from: string;
  to: string;
  includeArchived: boolean;
}

export const REPORT_META: Record<ReportId, { title: string; description: string; usesRange: boolean; usesArchived: boolean }> = {
  sales: { title: "Sales report", description: "Sales invoices with returns, cost of goods, and profit.", usesRange: true, usesArchived: true },
  purchases: { title: "Purchase report", description: "Purchases with paid and outstanding amounts.", usesRange: true, usesArchived: true },
  transactions: {
    title: "Transaction history",
    description: "Sales, purchases, returns, payments, and expenses in date order.",
    usesRange: true,
    usesArchived: true,
  },
  stock: { title: "Current stock", description: "Stock on hand and status for every active product.", usesRange: false, usesArchived: false },
  valuation: {
    title: "Inventory valuation",
    description: "Weighted-average cost and value of stock on hand.",
    usesRange: false,
    usesArchived: false,
  },
  expenses: { title: "Expense report", description: "Expenses by date and category.", usesRange: true, usesArchived: false },
  profitability: {
    title: "Profitability",
    description: "Daily net sales, gross profit, expenses, and operating profit.",
    usesRange: true,
    usesArchived: false,
  },
  "product-sales": {
    title: "Product sales and profit",
    description: "Quantity sold, revenue, and gross profit by product.",
    usesRange: true,
    usesArchived: false,
  },
  "cash-movement": {
    title: "Cash movement",
    description: "Money in and out by day and payment method.",
    usesRange: true,
    usesArchived: false,
  },
  balances: {
    title: "Customer and supplier balances",
    description: "Outstanding receivables and payables.",
    usesRange: false,
    usesArchived: false,
  },
  archived: {
    title: "Archived transactions",
    description: "Sales and purchases that have been archived.",
    usesRange: true,
    usesArchived: false,
  },
};
