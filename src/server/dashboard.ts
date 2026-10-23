import "server-only";
import { addDays, businessDate, eachDate } from "@/lib/dates";
import { COL, col, withId } from "./collections";
import { db } from "./firebaseAdmin";
import { listParties } from "./parties/service";
import { getSummaries, productSalesOf, summarize, type PeriodTotals } from "./reports/summaries";
import type {
  BalanceStatsDoc,
  InventoryStatsDoc,
  PaymentDoc,
  ProductDoc,
  PurchaseDoc,
  SaleDoc,
  WithId,
} from "./types";

export const TREND_DAYS = 30;

export interface TrendPoint {
  date: string;
  netSales: number;
  grossProfit: number;
  purchases: number;
  expenses: number;
}

export interface RecentItem {
  id: string;
  href: string;
  type: string;
  label: string;
  party: string;
  amountPaise: number;
  createdAt: string;
  status: string;
}

export interface DashboardData {
  today: string;
  range: { from: string; to: string };
  todayTotals: PeriodTotals;
  rangeTotals: PeriodTotals;
  trend: TrendPoint[];
  inventory: InventoryStatsDoc;
  balances: BalanceStatsDoc;
  alerts: WithId<ProductDoc>[];
  bestSellers: { productId: string; name: string; sku: string; qtyMilli: number; unit: string; revenuePaise: number; profitPaise: number }[];
  slowMovers: WithId<ProductDoc>[];
  recent: RecentItem[];
  topCustomers: { id: string; name: string; balancePaise: number }[];
  topSuppliers: { id: string; name: string; balancePaise: number }[];
}

export async function getDashboard(range: { from: string; to: string }): Promise<DashboardData> {
  const today = businessDate();
  const trendFrom = addDays(today, -(TREND_DAYS - 1));
  const queryFrom = range.from < trendFrom ? range.from : trendFrom;
  const queryTo = range.to > today ? range.to : today;

  const [summaries, statsSnaps, alertsSnap, slowSnap, salesSnap, purchasesSnap, paymentsSnap, customers, suppliers] =
    await Promise.all([
      getSummaries(queryFrom, queryTo),
      db().getAll(col(COL.stats).doc("inventory"), col(COL.stats).doc("balances")),
      col(COL.products).where("active", "==", true).where("stockStatus", "in", ["low", "out"]).limit(20).get(),
      col(COL.products)
        .where("active", "==", true)
        .where("stockStatus", "in", ["ok", "low"])
        .where("lastSoldDate", "<", trendFrom)
        .orderBy("lastSoldDate")
        .limit(8)
        .get(),
      col(COL.sales).orderBy("createdAt", "desc").limit(6).get(),
      col(COL.purchases).orderBy("createdAt", "desc").limit(6).get(),
      col(COL.payments).orderBy("createdAt", "desc").limit(6).get(),
      listParties("customer", { withBalanceOnly: true, limit: 5 }),
      listParties("supplier", { withBalanceOnly: true, limit: 5 }),
    ]);

  const byDate = new Map(summaries.map((s) => [s.date, s]));
  const pick = (from: string, to: string) => summaries.filter((s) => s.date >= from && s.date <= to);
  const trend = eachDate(trendFrom, today).map((date) => {
    const s = byDate.get(date);
    const t = summarize(s ? [s] : []);
    return { date, netSales: t.netSalesPaise, grossProfit: t.grossProfitPaise, purchases: t.purchasesPaise, expenses: t.expensesPaise };
  });

  const productTotals = [...productSalesOf(pick(trendFrom, today)).entries()]
    .filter(([, e]) => e.qtyMilli > 0)
    .sort((a, b) => b[1].revenuePaise - a[1].revenuePaise)
    .slice(0, 5);
  const bestSnaps = productTotals.length
    ? await db().getAll(...productTotals.map(([id]) => col(COL.products).doc(id)))
    : [];
  const bestSellers = productTotals.map(([productId, e], i) => {
    const p = bestSnaps[i]?.data() as ProductDoc | undefined;
    return {
      productId,
      name: p?.name ?? "(deleted product)",
      sku: p?.sku ?? "",
      unit: p?.unit ?? "",
      qtyMilli: e.qtyMilli,
      revenuePaise: e.revenuePaise,
      profitPaise: e.revenuePaise - e.cogsPaise,
    };
  });

  const recent: RecentItem[] = [
    ...salesSnap.docs.map((d) => {
      const s = d.data() as SaleDoc;
      return {
        id: d.id,
        href: `/sales/${d.id}`,
        type: "Sale",
        label: s.number ?? "Draft",
        party: s.customerName ?? "Walk-in",
        amountPaise: s.totals.totalPaise,
        createdAt: s.createdAt,
        status: s.status,
      };
    }),
    ...purchasesSnap.docs.map((d) => {
      const p = d.data() as PurchaseDoc;
      return {
        id: d.id,
        href: `/purchases/${d.id}`,
        type: "Purchase",
        label: p.number ?? "Draft",
        party: p.supplierName,
        amountPaise: p.totals.totalPaise,
        createdAt: p.createdAt,
        status: p.status,
      };
    }),
    ...paymentsSnap.docs.map((d) => {
      const p = d.data() as PaymentDoc;
      return {
        id: d.id,
        href: "/payments",
        type: p.direction === "in" ? "Money in" : "Money out",
        label: p.kind,
        party: p.partyName ?? "Walk-in",
        amountPaise: p.amountPaise,
        createdAt: p.createdAt,
        status: p.status,
      };
    }),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);

  return {
    today,
    range,
    todayTotals: summarize(pick(today, today)),
    rangeTotals: summarize(pick(range.from, range.to)),
    trend,
    inventory: { valuePaise: 0, productCount: 0, ...(statsSnaps[0].data() as Partial<InventoryStatsDoc> | undefined) },
    balances: { receivablePaise: 0, payablePaise: 0, ...(statsSnaps[1].data() as Partial<BalanceStatsDoc> | undefined) },
    alerts: alertsSnap.docs.map((d) => withId<ProductDoc>(d)).sort((a, b) => a.stockQtyMilli - b.stockQtyMilli),
    bestSellers,
    slowMovers: slowSnap.docs.map((d) => withId<ProductDoc>(d)),
    recent,
    topCustomers: customers.map((c) => ({ id: c.id, name: c.name, balancePaise: c.balancePaise })),
    topSuppliers: suppliers.map((s) => ({ id: s.id, name: s.name, balancePaise: s.balancePaise })),
  };
}
