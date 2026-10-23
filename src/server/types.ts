import type { BusinessDate } from "@/lib/dates";
import type { Paise } from "@/lib/money";
import type { QtyMilli } from "@/lib/qty";

/** All timestamps are stored as ISO-8601 UTC strings so they sort lexicographically. */
export type IsoTime = string;

export const PAYMENT_METHODS = ["cash", "upi", "bank"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  upi: "UPI",
  bank: "Bank transfer",
};

export type StockStatus = "ok" | "low" | "out";

export type StockMovementType =
  | "OPENING"
  | "PURCHASE"
  | "PURCHASE_REVERSAL"
  | "SALE"
  | "SALE_RETURN"
  | "SALE_REVERSAL"
  | "ADJUSTMENT";

export type WithId<T> = T & { id: string };

export interface ShopSettings {
  shopName: string;
  address: string;
  phone: string;
  invoicePrefix: string;
  purchasePrefix: string;
  returnPrefix: string;
  allowNegativeStock: boolean;
  updatedAt?: IsoTime;
}

export interface CategoryDoc {
  name: string;
  nameLower: string;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface ProductDoc {
  sku: string;
  skuKey: string;
  name: string;
  nameLower: string;
  categoryId: string | null;
  unit: string;
  /** Last purchase cost per unit. Used as the cost basis when stock is zero or negative. */
  purchaseCostPaise: Paise;
  sellingPricePaise: Paise;
  reorderLevelMilli: QtyMilli;
  stockQtyMilli: QtyMilli;
  stockValuePaise: Paise;
  stockStatus: StockStatus;
  active: boolean;
  searchTokens: string[];
  hasMovements: boolean;
  /** Latest business date with a sale, or "" if never sold. Powers slow-moving stock queries. */
  lastSoldDate: BusinessDate | "";
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export interface StockMovementDoc {
  productId: string;
  productName: string;
  sku: string;
  type: StockMovementType;
  qtyDeltaMilli: QtyMilli;
  valueDeltaPaise: Paise;
  balanceQtyAfter: QtyMilli;
  balanceValueAfter: Paise;
  refType: "product" | "adjustment" | "purchase" | "sale" | "saleReturn";
  refId: string;
  refNumber?: string;
  note?: string;
  businessDate: BusinessDate;
  createdAt: IsoTime;
  seq: number;
  actorUid: string;
}

export interface PartyDoc {
  name: string;
  nameLower: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  /** Customers: amount receivable. Suppliers: amount payable. */
  balancePaise: Paise;
  active: boolean;
  createdAt: IsoTime;
  updatedAt: IsoTime;
}

export type PartyType = "customer" | "supplier";

export type InvoiceStatus = "draft" | "posted" | "reversed";

export interface InvoiceLineInput {
  productId: string;
  qtyMilli: QtyMilli;
  /** Selling price for sales, unit cost for purchases. */
  unitPricePaise: Paise;
  discountPaise: Paise;
}

export interface InvoiceLine extends InvoiceLineInput {
  sku: string;
  name: string;
  unit: string;
  grossPaise: Paise;
  lineTotalPaise: Paise;
  billDiscountSharePaise: Paise;
  netPaise: Paise;
}

export interface SaleLine extends InvoiceLine {
  costOfGoodsPaise: Paise;
  returnedQtyMilli: QtyMilli;
  returnedValuePaise: Paise;
  returnedCogsPaise: Paise;
}

export interface InvoiceTotals {
  grossPaise: Paise;
  itemDiscountPaise: Paise;
  subtotalPaise: Paise;
  billDiscountPaise: Paise;
  totalPaise: Paise;
}

interface InvoiceBase {
  status: InvoiceStatus;
  number: string | null;
  businessDate: BusinessDate;
  monthKey: string;
  billDiscountPaise: Paise;
  totals: InvoiceTotals;
  paidPaise: Paise;
  duePaise: Paise;
  /** True while posted with an outstanding balance. Used for FIFO payment allocation. */
  isOpen: boolean;
  notes: string;
  archived: boolean;
  archivedAt: IsoTime | null;
  archiveBatchId: string | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
  postedAt: IsoTime | null;
  reversedAt: IsoTime | null;
  reversalReason: string | null;
}

export interface SaleDoc extends InvoiceBase {
  customerId: string | null;
  customerName: string | null;
  items: SaleLine[];
  costOfGoodsPaise: Paise;
  returnedPaise: Paise;
  returnedCogsPaise: Paise;
  refundedPaise: Paise;
}

export interface PurchaseDoc extends InvoiceBase {
  supplierId: string;
  supplierName: string;
  supplierInvoiceNo: string;
  items: InvoiceLine[];
  refundedPaise: Paise;
}

export interface SaleReturnLine {
  lineIndex: number;
  productId: string;
  name: string;
  qtyMilli: QtyMilli;
  valuePaise: Paise;
  cogsPaise: Paise;
}

export interface SaleReturnDoc {
  number: string;
  saleId: string;
  saleNumber: string;
  customerId: string | null;
  customerName: string | null;
  businessDate: BusinessDate;
  monthKey: string;
  items: SaleReturnLine[];
  totalPaise: Paise;
  cogsPaise: Paise;
  dueReductionPaise: Paise;
  refundPaise: Paise;
  refundMethod: PaymentMethod | null;
  reason: string;
  createdAt: IsoTime;
  actorUid: string;
}

export type PaymentKind = "receipt" | "payment" | "refund" | "reversal";

export interface PaymentAllocation {
  refType: "sale" | "purchase";
  refId: string;
  number: string;
  amountPaise: Paise;
}

export interface PaymentDoc {
  kind: PaymentKind;
  direction: "in" | "out";
  method: PaymentMethod;
  amountPaise: Paise;
  partyType: PartyType | null;
  partyId: string | null;
  partyName: string | null;
  allocations: PaymentAllocation[];
  allocationRefIds: string[];
  refType: "sale" | "purchase" | "saleReturn" | "payment" | null;
  refId: string | null;
  businessDate: BusinessDate;
  monthKey: string;
  status: "active" | "reversed";
  reversalOf: string | null;
  reversedBy: string | null;
  reason: string;
  notes: string;
  createdAt: IsoTime;
  actorUid: string;
}

export interface ExpenseCategoryDoc {
  name: string;
  nameLower: string;
  createdAt: IsoTime;
}

export interface ExpenseDoc {
  categoryId: string;
  categoryName: string;
  businessDate: BusinessDate;
  monthKey: string;
  amountPaise: Paise;
  method: PaymentMethod;
  description: string;
  status: "active" | "voided";
  voidReason: string | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
  actorUid: string;
}

export interface ProductSalesEntry {
  qtyMilli: QtyMilli;
  revenuePaise: Paise;
  cogsPaise: Paise;
}

export interface DailySummaryDoc {
  date: BusinessDate;
  monthKey: string;
  salesCount: number;
  salesPaise: Paise;
  salesCogsPaise: Paise;
  returnsPaise: Paise;
  returnsCogsPaise: Paise;
  purchasesCount: number;
  purchasesPaise: Paise;
  expensesPaise: Paise;
  cashIn: Partial<Record<PaymentMethod, Paise>>;
  cashOut: Partial<Record<PaymentMethod, Paise>>;
  productSales: Record<string, ProductSalesEntry>;
}

export interface InventoryStatsDoc {
  valuePaise: Paise;
  productCount: number;
}

export interface BalanceStatsDoc {
  receivablePaise: Paise;
  payablePaise: Paise;
}

export interface AuditLogDoc {
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  data?: Record<string, unknown>;
  actorUid: string;
  actorEmail: string;
  createdAt: IsoTime;
}

export type ArchiveBatchStatus = "pending" | "generated" | "verified" | "failed" | "committed" | "cancelled";

export interface ArchiveBatchDoc {
  status: ArchiveBatchStatus;
  cutoffDate: BusinessDate;
  saleIds: string[];
  purchaseIds: string[];
  saleCount: number;
  purchaseCount: number;
  salesTotalPaise: Paise;
  purchasesTotalPaise: Paise;
  filePath: string | null;
  fileSha256: string | null;
  fileSizeBytes: number | null;
  verifiedAt: IsoTime | null;
  failureReason: string | null;
  committedAt: IsoTime | null;
  createdAt: IsoTime;
  updatedAt: IsoTime;
  actorUid: string;
}
