import Form from "next/form";
import Link from "next/link";
import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/page-header";
import { StockBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addDays, businessDate, formatDateTime, formatDisplayDate, isBusinessDate, startOfMonth } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { getDashboard, TREND_DAYS } from "@/server/dashboard";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/server/types";

export const metadata = { title: "Dashboard" };

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-xl tabular-nums ${value < 0 ? "text-destructive" : ""}`}>{formatINR(value)}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const today = businessDate();
  const preset = param(sp, "preset") ?? "month";
  let from = startOfMonth(today);
  let to = today;
  if (preset === "today") from = today;
  if (preset === "7d") from = addDays(today, -6);
  if (preset === "custom") {
    const f = param(sp, "from");
    const t = param(sp, "to");
    if (f && t && isBusinessDate(f) && isBusinessDate(t) && f <= t) {
      from = f;
      to = t;
    }
  }
  const d = await getDashboard({ from, to });
  const r = d.rangeTotals;
  const presetLink = (p: string, label: string) => (
    <Button asChild variant={preset === p ? "default" : "outline"} size="sm">
      <Link href={`/dashboard?preset=${p}`}>{label}</Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Today is ${formatDisplayDate(today)}`}
        actions={
          <>
            <Button asChild>
              <Link href="/sales/new">New sale</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/purchases/new">New purchase</Link>
            </Button>
          </>
        }
      />

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Today</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Sales" value={d.todayTotals.netSalesPaise} hint={`${d.todayTotals.salesCount} invoice(s), net of returns`} />
          <Stat label="Purchases" value={d.todayTotals.purchasesPaise} hint={`${d.todayTotals.purchasesCount} purchase(s)`} />
          <Stat label="Gross profit" value={d.todayTotals.grossProfitPaise} />
          <Stat label="Expenses" value={d.todayTotals.expensesPaise} />
          <Stat label="Net cash movement" value={d.todayTotals.cashInTotal - d.todayTotals.cashOutTotal} hint="All methods, in minus out" />
        </div>
      </section>

      <section className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Period: {formatDisplayDate(from)} to {formatDisplayDate(to)}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {presetLink("today", "Today")}
            {presetLink("7d", "7 days")}
            {presetLink("month", "This month")}
            <Form action="/dashboard" className="flex items-center gap-1">
              <input type="hidden" name="preset" value="custom" />
              <Input type="date" name="from" defaultValue={from} className="h-7 w-36" aria-label="From" />
              <Input type="date" name="to" defaultValue={to} className="h-7 w-36" aria-label="To" />
              <Button type="submit" size="sm" variant={preset === "custom" ? "default" : "outline"}>
                Apply
              </Button>
            </Form>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Net sales" value={r.netSalesPaise} hint={`${r.salesCount} invoices, returns ${formatINR(r.returnsPaise)}`} />
          <Stat label="Purchases" value={r.purchasesPaise} hint={`${r.purchasesCount} purchases`} />
          <Stat label="Gross profit" value={r.grossProfitPaise} hint={`Cost of goods ${formatINR(r.cogsPaise)}`} />
          <Stat label="Expenses" value={r.expensesPaise} />
          <Stat label="Operating profit (est.)" value={r.operatingProfitPaise} hint="Gross profit minus expenses" />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {PAYMENT_METHODS.map((m) => (
            <Card key={m} size="sm">
              <CardHeader>
                <CardDescription>{PAYMENT_METHOD_LABELS[m]}</CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between text-sm tabular-nums">
                <span className="text-emerald-700 dark:text-emerald-400">In {formatINR(r.cashIn[m])}</span>
                <span className="text-destructive">Out {formatINR(r.cashOut[m])}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales and profit, last {TREND_DAYS} days</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={d.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventory and balances</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Products</span>
              <span className="tabular-nums">{d.inventory.productCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inventory value (at cost)</span>
              <span className="font-semibold tabular-nums">{formatINR(d.inventory.valuePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customers owe you</span>
              <span className="tabular-nums">{formatINR(d.balances.receivablePaise)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">You owe suppliers</span>
              <span className="tabular-nums">{formatINR(d.balances.payablePaise)}</span>
            </div>
            {d.topCustomers.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Top receivables</p>
                {d.topCustomers.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`} className="flex justify-between hover:underline">
                    <span>{c.name}</span>
                    <span className="tabular-nums">{formatINR(c.balancePaise)}</span>
                  </Link>
                ))}
              </div>
            )}
            {d.topSuppliers.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Top payables</p>
                {d.topSuppliers.map((s) => (
                  <Link key={s.id} href={`/suppliers/${s.id}`} className="flex justify-between hover:underline">
                    <span>{s.name}</span>
                    <span className="tabular-nums">{formatINR(s.balancePaise)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Low and out of stock</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.alerts.length === 0 && <p className="text-muted-foreground">All products are above their reorder level.</p>}
            {d.alerts.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="flex items-center justify-between gap-2 hover:underline">
                <span className="truncate">{p.name}</span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  {formatQty(p.stockQtyMilli)} {p.unit} <StockBadge status={p.stockStatus} />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Best sellers</CardTitle>
            <CardDescription>Last {TREND_DAYS} days by revenue</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.bestSellers.length === 0 && <p className="text-muted-foreground">No sales yet.</p>}
            {d.bestSellers.map((b) => (
              <Link key={b.productId} href={`/products/${b.productId}`} className="flex justify-between gap-2 hover:underline">
                <span className="truncate">
                  {b.name}
                  <span className="ml-1 text-xs text-muted-foreground">
                    {formatQty(b.qtyMilli)} {b.unit}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatINR(b.revenuePaise)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Slow-moving stock</CardTitle>
            <CardDescription>In stock, no sales in {TREND_DAYS} days</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.slowMovers.length === 0 && <p className="text-muted-foreground">Nothing slow-moving.</p>}
            {d.slowMovers.map((p) => (
              <Link key={p.id} href={`/products/${p.id}`} className="flex justify-between gap-2 hover:underline">
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {p.lastSoldDate ? `last sold ${formatDisplayDate(p.lastSoldDate)}` : "never sold"}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {d.recent.length === 0 && <p className="text-muted-foreground">No transactions yet.</p>}
            {d.recent.map((t) => (
              <Link key={`${t.type}-${t.id}`} href={t.href} className="flex justify-between gap-2 hover:underline" title={formatDateTime(t.createdAt)}>
                <span className="truncate">
                  {t.type} {t.label !== t.type ? t.label : ""}
                  <span className="ml-1 text-xs text-muted-foreground">{t.party}</span>
                  {t.status === "reversed" && <span className="ml-1 text-xs text-destructive">reversed</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatINR(t.amountPaise)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
