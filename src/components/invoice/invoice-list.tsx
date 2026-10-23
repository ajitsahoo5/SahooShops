import Form from "next/form";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/forms";
import { InvoiceStatusBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { InvoiceListQuery } from "@/lib/schemas/invoice";
import type { PurchaseDoc, SaleDoc, WithId } from "@/server/types";

type Row = WithId<SaleDoc> | WithId<PurchaseDoc>;

function partyName(row: Row): string {
  return "supplierName" in row ? row.supplierName : row.customerName ?? "Walk-in";
}

export function InvoiceFilters({
  path,
  filters,
  parties,
  partyLabel,
}: {
  path: string;
  filters: Partial<InvoiceListQuery>;
  parties: { id: string; name: string }[];
  partyLabel: string;
}) {
  return (
    <Form action={path} className="mb-4 flex flex-wrap items-end gap-2">
      <Input name="number" placeholder="Invoice no." defaultValue={filters.number ?? ""} className="w-36" />
      <Input type="date" name="from" defaultValue={filters.from ?? ""} className="w-40" aria-label="From" />
      <Input type="date" name="to" defaultValue={filters.to ?? ""} className="w-40" aria-label="To" />
      <NativeSelect name="status" defaultValue={filters.status ?? ""} className="w-32" aria-label="Status">
        <option value="">Any status</option>
        <option value="draft">Draft</option>
        <option value="posted">Posted</option>
        <option value="reversed">Reversed</option>
      </NativeSelect>
      <NativeSelect name="partyId" defaultValue={filters.partyId ?? ""} className="w-44" aria-label={partyLabel}>
        <option value="">All {partyLabel.toLowerCase()}s</option>
        {parties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </NativeSelect>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="includeArchived" value="true" defaultChecked={filters.includeArchived} /> Include archived
      </label>
      <Button type="submit" variant="secondary">
        Filter
      </Button>
    </Form>
  );
}

export function InvoiceTable({ rows, path, partyLabel }: { rows: Row[]; path: string; partyLabel: string }) {
  if (rows.length === 0) return <EmptyState message="No transactions match these filters." />;
  const posted = rows.filter((r) => r.status === "posted");
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Number</TableHead>
            <TableHead>{partyLabel}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Due</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{formatDisplayDate(r.businessDate)}</TableCell>
              <TableCell>
                <Link href={`${path}/${r.id}`} className="font-medium hover:underline">
                  {r.number ?? "Draft"}
                </Link>
              </TableCell>
              <TableCell>{partyName(r)}</TableCell>
              <TableCell>
                <InvoiceStatusBadge status={r.status} archived={r.archived} />
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(r.totals.totalPaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(r.paidPaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{r.duePaise ? formatINR(r.duePaise) : "-"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4}>Posted total ({posted.length})</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatINR(posted.reduce((s, r) => s + r.totals.totalPaise, 0))}
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatINR(posted.reduce((s, r) => s + r.paidPaise, 0))}</TableCell>
            <TableCell className="text-right tabular-nums">{formatINR(posted.reduce((s, r) => s + r.duePaise, 0))}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
