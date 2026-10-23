import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, type PaymentDoc, type WithId } from "@/server/types";

const KIND_LABELS: Record<PaymentDoc["kind"], string> = {
  receipt: "Received",
  payment: "Paid",
  refund: "Refund",
  reversal: "Reversal",
};

function partyHref(p: PaymentDoc): string | null {
  if (!p.partyId || !p.partyType) return null;
  return `/${p.partyType === "customer" ? "customers" : "suppliers"}/${p.partyId}`;
}

export function PaymentsTable({
  payments,
  showParty = true,
  actions,
}: {
  payments: WithId<PaymentDoc>[];
  showParty?: boolean;
  actions?: (payment: WithId<PaymentDoc>) => React.ReactNode;
}) {
  if (payments.length === 0) return <EmptyState message="No payments recorded." />;
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            {showParty && <TableHead>Party</TableHead>}
            <TableHead>Method</TableHead>
            <TableHead>Applied to</TableHead>
            <TableHead className="text-right">In</TableHead>
            <TableHead className="text-right">Out</TableHead>
            {actions && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => {
            const href = partyHref(p);
            return (
              <TableRow key={p.id} className={p.status === "reversed" ? "text-muted-foreground line-through" : undefined}>
                <TableCell title={formatDateTime(p.createdAt)}>{formatDisplayDate(p.businessDate)}</TableCell>
                <TableCell>
                  {KIND_LABELS[p.kind]}
                  {p.status === "reversed" && (
                    <Badge variant="outline" className="ml-2 no-underline">
                      reversed
                    </Badge>
                  )}
                </TableCell>
                {showParty && (
                  <TableCell>{href ? <Link href={href} className="hover:underline">{p.partyName}</Link> : p.partyName ?? "Walk-in"}</TableCell>
                )}
                <TableCell>{PAYMENT_METHOD_LABELS[p.method]}</TableCell>
                <TableCell className="max-w-64 text-xs">
                  {p.allocations.length > 0
                    ? p.allocations.map((a) => (
                        <Link
                          key={a.refId}
                          href={`/${a.refType === "sale" ? "sales" : "purchases"}/${a.refId}`}
                          className="mr-2 hover:underline"
                        >
                          {a.number} ({formatINR(a.amountPaise)})
                        </Link>
                      ))
                    : p.reason || p.notes || "-"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{p.direction === "in" ? formatINR(p.amountPaise) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{p.direction === "out" ? formatINR(p.amountPaise) : ""}</TableCell>
                {actions && <TableCell className="text-right">{actions(p)}</TableCell>}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
