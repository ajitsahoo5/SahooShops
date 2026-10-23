import Form from "next/form";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, businessDate, formatDisplayDate, startOfMonth } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { expenseListQuerySchema } from "@/lib/schemas/payment";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { listExpenseCategories, listExpenses } from "@/server/expenses/service";
import { PAYMENT_METHOD_LABELS } from "@/server/types";
import { ExpenseFormDialog, VoidExpenseButton } from "./expense-dialogs";

export const metadata = { title: "Expenses" };

export default async function ExpensesPage(props: PageProps<"/expenses">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const today = businessDate();
  const parsed = expenseListQuerySchema.safeParse({
    from: param(sp, "from") ?? startOfMonth(today),
    to: param(sp, "to") ?? today,
    categoryId: param(sp, "categoryId"),
  });
  const filters = parsed.success ? parsed.data : { from: startOfMonth(today), to: today };
  const [expenses, categories] = await Promise.all([listExpenses(filters), listExpenseCategories()]);
  const active = expenses.filter((e) => e.status === "active");
  const total = active.reduce((s, e) => s + e.amountPaise, 0);
  const todayTotal = active.filter((e) => e.businessDate === today).reduce((s, e) => s + e.amountPaise, 0);
  const byCategory = new Map<string, number>();
  for (const e of active) byCategory.set(e.categoryName, (byCategory.get(e.categoryName) ?? 0) + e.amountPaise);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`Today ${formatINR(todayTotal)} · selected period ${formatINR(total)}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/expenses/categories">Categories</Link>
            </Button>
            <ExpenseFormDialog categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
          </>
        }
      />
      <Form action="/expenses" className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="date" name="from" defaultValue={filters.from} className="w-40" aria-label="From" />
        <Input type="date" name="to" defaultValue={filters.to} className="w-40" aria-label="To" />
        <NativeSelect name="categoryId" defaultValue={filters.categoryId ?? ""} className="w-44" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        <Button asChild variant="ghost">
          <Link href={`/expenses?from=${addDays(today, -6)}&to=${today}`}>Last 7 days</Link>
        </Button>
      </Form>
      {byCategory.size > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {[...byCategory.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, amount]) => (
              <span key={name} className="rounded-full border px-3 py-1">
                {name}: <span className="tabular-nums">{formatINR(amount)}</span>
              </span>
            ))}
        </div>
      )}
      {expenses.length === 0 ? (
        <EmptyState message="No expenses in this period." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id} className={e.status === "voided" ? "text-muted-foreground line-through" : undefined}>
                  <TableCell>{formatDisplayDate(e.businessDate)}</TableCell>
                  <TableCell>{e.categoryName}</TableCell>
                  <TableCell className="max-w-72 truncate">
                    {e.description || "-"}
                    {e.voidReason && <span className="ml-2 text-xs no-underline">(voided: {e.voidReason})</span>}
                  </TableCell>
                  <TableCell>{PAYMENT_METHOD_LABELS[e.method]}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(e.amountPaise)}</TableCell>
                  <TableCell className="text-right">{e.status === "active" && <VoidExpenseButton id={e.id} />}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>Total (excluding voided)</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(total)}</TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
    </>
  );
}
