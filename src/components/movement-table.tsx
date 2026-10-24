import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import type { StockMovementDoc, StockMovementType, WithId } from "@/server/types";

export const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  OPENING: "Opening stock",
  PURCHASE: "Purchase",
  PURCHASE_REVERSAL: "Purchase reversal",
  SALE: "Sale",
  SALE_RETURN: "Sales return",
  SALE_REVERSAL: "Sale reversal",
  ADJUSTMENT: "Adjustment",
};

function refHref(m: StockMovementDoc): string | null {
  // Sales return movements reference the original sale.
  if (m.refType === "sale" || m.refType === "saleReturn") return `/sales/${m.refId}`;
  if (m.refType === "purchase") return `/purchases/${m.refId}`;
  return null;
}

export function MovementTable({
  movements,
  showProduct = true,
}: {
  movements: WithId<StockMovementDoc>[];
  showProduct?: boolean;
}) {
  if (movements.length === 0) return <EmptyState message="No stock movements yet." />;
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-indigo-950/[0.04]">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showProduct && <TableHead>Product</TableHead>}
            <TableHead>Type</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Qty change</TableHead>
            <TableHead className="text-right">Value change</TableHead>
            <TableHead className="text-right">Balance qty</TableHead>
            <TableHead className="text-right">Balance value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => {
            const href = refHref(m);
            return (
              <TableRow key={m.id}>
                <TableCell title={formatDateTime(m.createdAt)}>{formatDisplayDate(m.businessDate)}</TableCell>
                {showProduct && (
                  <TableCell>
                    <Link href={`/products/${m.productId}`} className="hover:underline">
                      {m.productName}
                    </Link>
                    <div className="font-mono text-xs text-muted-foreground">{m.sku}</div>
                  </TableCell>
                )}
                <TableCell>{MOVEMENT_LABELS[m.type]}</TableCell>
                <TableCell className="max-w-64 truncate">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {m.refNumber ?? "View"}
                    </Link>
                  ) : (
                    m.refNumber ?? m.note ?? "-"
                  )}
                  {href && m.note && <div className="truncate text-xs text-muted-foreground">{m.note}</div>}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${m.qtyDeltaMilli < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}
                >
                  {m.qtyDeltaMilli > 0 ? "+" : ""}
                  {formatQty(m.qtyDeltaMilli)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(m.valueDeltaPaise)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatQty(m.balanceQtyAfter)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatINR(m.balanceValueAfter)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
