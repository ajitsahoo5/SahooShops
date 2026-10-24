import Form from "next/form";
import Link from "next/link";
import {
  AlertTriangleIcon,
  ArrowDownLeftIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  BanknoteIcon,
  CalendarIcon,
  ClockIcon,
  CoinsIcon,
  HourglassIcon,
  PackageIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  TrendingUpIcon,
  TrophyIcon,
  TruckIcon,
  WalletIcon,
  WarehouseIcon,
  type LucideIcon,
} from "lucide-react";
import { TrendChart } from "@/components/charts/trend-chart";
import { PageHeader } from "@/components/page-header";
import { StockBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime, formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { cn } from "@/lib/utils";
import { TREND_DAYS, type DashboardData } from "@/server/dashboard";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/server/types";

const TONES = {
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  green: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
} as const;
type Tone = keyof typeof TONES;

function IconTile({ icon: Icon, tone, className }: { icon: LucideIcon; tone: Tone; className?: string }) {
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", TONES[tone], className)}>
      <Icon className="size-5" />
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  tone,
  className,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone: Tone;
  className?: string;
}) {
  return (
    <Card size="sm" className={className}>
      <CardContent className="flex items-center gap-3">
        <IconTile icon={icon} tone={tone} />
        <div className="min-w-0">
          <p className="truncate text-sm text-muted-foreground">{label}</p>
          <p className={cn("text-xl font-semibold tracking-tight tabular-nums", value < 0 && "text-destructive")}>
            {formatINR(value)}
          </p>
          {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MetricTile({ label, value, hint, icon, tone }: { label: string; value: number; hint?: string; icon: LucideIcon; tone: Tone }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl bg-muted/60 px-3 py-4 text-center">
      <IconTile icon={icon} tone={tone} className="size-9 rounded-lg" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", value < 0 && "text-destructive")}>{formatINR(value)}</p>
      {hint && <p className="text-[0.7rem] leading-tight text-muted-foreground">{hint}</p>}
    </div>
  );
}

function PillRow({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: Tone }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2.5", TONES[tone])}>
      <span className="flex items-center gap-2 font-medium">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="rounded-md bg-card/80 px-2 py-0.5 font-semibold text-foreground tabular-nums shadow-xs">{value}</span>
    </div>
  );
}

function ListCard({
  title,
  description,
  icon,
  tone,
  href,
  children,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  tone: Tone;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <IconTile icon={icon} tone={tone} className="size-9 rounded-lg" />
          <div className="min-w-0">
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription className="text-xs">{description}</CardDescription>}
          </div>
        </div>
        {href && (
          <CardAction>
            <Button asChild variant="ghost" size="icon-sm" aria-label={`Open ${title.toLowerCase()}`}>
              <Link href={href}>
                <ArrowRightIcon />
              </Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex max-h-80 flex-col gap-1.5 overflow-y-auto text-sm">{children}</CardContent>
    </Card>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-muted-foreground">{children}</p>;
}

const ROW_LINK = "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 transition-colors hover:bg-muted";

export function DashboardView({ d, preset }: { d: DashboardData; preset: string }) {
  const { today } = d;
  const { from, to } = d.range;
  const r = d.rangeTotals;
  const t = d.todayTotals;
  const presetLink = (p: string, label: string) => (
    <Link
      href={`/dashboard?preset=${p}`}
      aria-current={preset === p ? "true" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        preset === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Dashboard" description={`Today is ${formatDisplayDate(today)}. Here is how the shop is doing.`} />

      <section className="mb-6" aria-labelledby="today-heading">
        <h2 id="today-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ClockIcon className="size-4" /> Today at a glance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          <StatCard label="Sales" value={t.netSalesPaise} hint={`${t.salesCount} invoice(s), net of returns`} icon={ShoppingCartIcon} tone="blue" />
          <StatCard label="Purchases" value={t.purchasesPaise} hint={`${t.purchasesCount} purchase(s)`} icon={TruckIcon} tone="sky" />
          <StatCard label="Gross profit" value={t.grossProfitPaise} hint="Sales minus cost of goods" icon={TrendingUpIcon} tone="green" />
          <StatCard label="Expenses" value={t.expensesPaise} hint="Shop running costs" icon={WalletIcon} tone="amber" />
          <StatCard
            label="Net cash movement"
            value={t.cashInTotal - t.cashOutTotal}
            hint="All methods, in minus out"
            icon={BanknoteIcon}
            tone="violet"
            className="sm:col-span-2 2xl:col-span-1"
          />
        </div>
      </section>

      <Card className="mb-6">
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Period overview</CardTitle>
            <CardDescription className="flex items-center gap-1.5">
              <CalendarIcon className="size-3.5" />
              {formatDisplayDate(from)} to {formatDisplayDate(to)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Period" className="inline-flex rounded-lg bg-muted p-1">
              {presetLink("today", "Today")}
              {presetLink("7d", "7 days")}
              {presetLink("month", "This month")}
            </nav>
            <Form action="/dashboard" className="flex flex-wrap items-center gap-1.5">
              <input type="hidden" name="preset" value="custom" />
              <Input type="date" name="from" defaultValue={from} className="w-36" aria-label="From" />
              <span className="text-xs text-muted-foreground">to</span>
              <Input type="date" name="to" defaultValue={to} className="w-36" aria-label="To" />
              <Button type="submit" variant={preset === "custom" ? "default" : "outline"}>
                Apply
              </Button>
            </Form>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <MetricTile
              label="Net sales"
              value={r.netSalesPaise}
              hint={`${r.salesCount} invoices, returns ${formatINR(r.returnsPaise)}`}
              icon={ShoppingCartIcon}
              tone="blue"
            />
            <MetricTile label="Purchases" value={r.purchasesPaise} hint={`${r.purchasesCount} purchases`} icon={TruckIcon} tone="sky" />
            <MetricTile
              label="Gross profit"
              value={r.grossProfitPaise}
              hint={`Cost of goods ${formatINR(r.cogsPaise)}`}
              icon={TrendingUpIcon}
              tone="green"
            />
            <MetricTile label="Expenses" value={r.expensesPaise} icon={WalletIcon} tone="amber" />
            <MetricTile
              label="Operating profit (est.)"
              value={r.operatingProfitPaise}
              hint="Gross profit minus expenses"
              icon={CoinsIcon}
              tone="violet"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Money in and out by method</p>
            <div className="grid gap-3 md:grid-cols-3">
              {PAYMENT_METHODS.map((m) => (
                <div key={m} className="rounded-xl border px-4 py-3">
                  <p className="mb-2 text-sm font-medium">{PAYMENT_METHOD_LABELS[m]}</p>
                  <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <ArrowDownLeftIcon className="size-4" /> {formatINR(r.cashIn[m])}
                    </span>
                    <span className="flex items-center gap-1 text-destructive">
                      <ArrowUpRightIcon className="size-4" /> {formatINR(r.cashOut[m])}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales and profit</CardTitle>
            <CardDescription>Last {TREND_DAYS} days</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">
            <TrendChart data={d.trend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inventory and balances</CardTitle>
            <CardDescription>Stock on hand and money owed</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <PillRow label="Products" value={String(d.inventory.productCount)} icon={PackageIcon} tone="blue" />
            <PillRow label="Stock value (at cost)" value={formatINR(d.inventory.valuePaise)} icon={WarehouseIcon} tone="violet" />
            <PillRow label="Customers owe you" value={formatINR(d.balances.receivablePaise)} icon={ArrowDownLeftIcon} tone="green" />
            <PillRow label="You owe suppliers" value={formatINR(d.balances.payablePaise)} icon={ArrowUpRightIcon} tone="pink" />
            {d.topCustomers.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Top receivables</p>
                {d.topCustomers.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`} className={ROW_LINK}>
                    <span className="truncate">{c.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatINR(c.balancePaise)}</span>
                  </Link>
                ))}
              </div>
            )}
            {d.topSuppliers.length > 0 && (
              <div className="mt-1">
                <p className="mb-1 px-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Top payables</p>
                {d.topSuppliers.map((s) => (
                  <Link key={s.id} href={`/suppliers/${s.id}`} className={ROW_LINK}>
                    <span className="truncate">{s.name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatINR(s.balancePaise)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
        <ListCard title="Recent activity" description="Latest sales, purchases, and payments" icon={ReceiptTextIcon} tone="blue" href="/sales">
          {d.recent.length === 0 && <Empty>No transactions yet.</Empty>}
          {d.recent.map((item) => {
            const incoming = item.type === "Sale" || item.type === "Money in";
            return (
              <Link
                key={`${item.type}-${item.id}`}
                href={item.href}
                title={formatDateTime(item.createdAt)}
                className="rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {item.type} {item.label !== item.type ? item.label : ""}
                  </span>
                  {item.status === "reversed" && <span className="shrink-0 text-xs text-destructive">reversed</span>}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-muted-foreground">{item.party}</span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 font-semibold tabular-nums",
                      incoming ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                    )}
                  >
                    {formatINR(item.amountPaise)}
                    {incoming ? <ArrowDownLeftIcon className="size-3.5" /> : <ArrowUpRightIcon className="size-3.5" />}
                  </span>
                </span>
              </Link>
            );
          })}
        </ListCard>

        <ListCard title="Low and out of stock" description="Time to reorder" icon={AlertTriangleIcon} tone="amber" href="/products?status=low">
          {d.alerts.length === 0 && <Empty>All products are above their reorder level.</Empty>}
          {d.alerts.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className={ROW_LINK}>
              <span className="truncate">{p.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                {formatQty(p.stockQtyMilli)} {p.unit} <StockBadge status={p.stockStatus} />
              </span>
            </Link>
          ))}
        </ListCard>

        <ListCard title="Best sellers" description={`Last ${TREND_DAYS} days by revenue`} icon={TrophyIcon} tone="green" href="/reports">
          {d.bestSellers.length === 0 && <Empty>No sales yet.</Empty>}
          {d.bestSellers.map((b, i) => (
            <Link key={b.productId} href={`/products/${b.productId}`} className={ROW_LINK}>
              <span className="flex min-w-0 items-center gap-2.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{b.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {formatQty(b.qtyMilli)} {b.unit} sold
                  </span>
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{formatINR(b.revenuePaise)}</span>
            </Link>
          ))}
        </ListCard>

        <ListCard
          title="Slow-moving stock"
          description={`In stock, no sales in ${TREND_DAYS} days`}
          icon={HourglassIcon}
          tone="pink"
          href="/products"
        >
          {d.slowMovers.length === 0 && <Empty>Nothing slow-moving.</Empty>}
          {d.slowMovers.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} className={ROW_LINK}>
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {p.lastSoldDate ? `last sold ${formatDisplayDate(p.lastSoldDate)}` : "never sold"}
              </span>
            </Link>
          ))}
        </ListCard>
      </div>
    </>
  );
}
