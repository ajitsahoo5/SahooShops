import "server-only";
import { grossProfit, operatingProfit } from "@/lib/invoice-math";
import { COL, col } from "../collections";
import { PAYMENT_METHODS, type DailySummaryDoc, type PaymentMethod, type ProductSalesEntry } from "../types";

export async function getSummaries(from: string, to: string): Promise<DailySummaryDoc[]> {
  const snap = await col(COL.dailySummaries).where("date", ">=", from).where("date", "<=", to).orderBy("date").get();
  return snap.docs.map((d) => normalizeSummary(d.data() as Partial<DailySummaryDoc>));
}

export function normalizeSummary(s: Partial<DailySummaryDoc>): DailySummaryDoc {
  return {
    date: s.date ?? "",
    monthKey: s.monthKey ?? "",
    salesCount: s.salesCount ?? 0,
    salesPaise: s.salesPaise ?? 0,
    salesCogsPaise: s.salesCogsPaise ?? 0,
    returnsPaise: s.returnsPaise ?? 0,
    returnsCogsPaise: s.returnsCogsPaise ?? 0,
    purchasesCount: s.purchasesCount ?? 0,
    purchasesPaise: s.purchasesPaise ?? 0,
    expensesPaise: s.expensesPaise ?? 0,
    cashIn: s.cashIn ?? {},
    cashOut: s.cashOut ?? {},
    productSales: s.productSales ?? {},
  };
}

export interface PeriodTotals {
  salesCount: number;
  salesPaise: number;
  returnsPaise: number;
  netSalesPaise: number;
  cogsPaise: number;
  grossProfitPaise: number;
  purchasesCount: number;
  purchasesPaise: number;
  expensesPaise: number;
  operatingProfitPaise: number;
  cashIn: Record<PaymentMethod, number>;
  cashOut: Record<PaymentMethod, number>;
  cashInTotal: number;
  cashOutTotal: number;
}

export function summarize(rows: DailySummaryDoc[]): PeriodTotals {
  const zero = () => Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  const t = {
    salesCount: 0,
    salesPaise: 0,
    salesCogsPaise: 0,
    returnsPaise: 0,
    returnsCogsPaise: 0,
    purchasesCount: 0,
    purchasesPaise: 0,
    expensesPaise: 0,
    cashIn: zero(),
    cashOut: zero(),
  };
  for (const s of rows) {
    t.salesCount += s.salesCount;
    t.salesPaise += s.salesPaise;
    t.salesCogsPaise += s.salesCogsPaise;
    t.returnsPaise += s.returnsPaise;
    t.returnsCogsPaise += s.returnsCogsPaise;
    t.purchasesCount += s.purchasesCount;
    t.purchasesPaise += s.purchasesPaise;
    t.expensesPaise += s.expensesPaise;
    for (const m of PAYMENT_METHODS) {
      t.cashIn[m] += s.cashIn[m] ?? 0;
      t.cashOut[m] += s.cashOut[m] ?? 0;
    }
  }
  const gp = grossProfit({
    salesPaise: t.salesPaise,
    returnsPaise: t.returnsPaise,
    cogsPaise: t.salesCogsPaise,
    returnsCogsPaise: t.returnsCogsPaise,
  });
  return {
    salesCount: t.salesCount,
    salesPaise: t.salesPaise,
    returnsPaise: t.returnsPaise,
    netSalesPaise: t.salesPaise - t.returnsPaise,
    cogsPaise: t.salesCogsPaise - t.returnsCogsPaise,
    grossProfitPaise: gp,
    purchasesCount: t.purchasesCount,
    purchasesPaise: t.purchasesPaise,
    expensesPaise: t.expensesPaise,
    operatingProfitPaise: operatingProfit(gp, t.expensesPaise),
    cashIn: t.cashIn,
    cashOut: t.cashOut,
    cashInTotal: PAYMENT_METHODS.reduce((s, m) => s + t.cashIn[m], 0),
    cashOutTotal: PAYMENT_METHODS.reduce((s, m) => s + t.cashOut[m], 0),
  };
}

export function productSalesOf(rows: DailySummaryDoc[]): Map<string, ProductSalesEntry> {
  const out = new Map<string, ProductSalesEntry>();
  for (const s of rows) {
    for (const [productId, e] of Object.entries(s.productSales)) {
      const cur = out.get(productId) ?? { qtyMilli: 0, revenuePaise: 0, cogsPaise: 0 };
      cur.qtyMilli += e.qtyMilli ?? 0;
      cur.revenuePaise += e.revenuePaise ?? 0;
      cur.cogsPaise += e.cogsPaise ?? 0;
      out.set(productId, cur);
    }
  }
  return out;
}
