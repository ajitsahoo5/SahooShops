import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import type { InvoiceLine, InvoiceTotals, SaleLine } from "@/server/types";

export function InvoiceLinesTable({
  items,
  totals,
  showReturns = false,
  showCost = false,
}: {
  items: (InvoiceLine | SaleLine)[];
  totals: InvoiceTotals;
  showReturns?: boolean;
  showCost?: boolean;
}) {
  const extraCols = (showReturns ? 1 : 0) + (showCost ? 1 : 0);
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">Discount</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            {showReturns && <TableHead className="text-right print:hidden">Returned</TableHead>}
            {showCost && <TableHead className="text-right print:hidden">Cost of goods</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((l, i) => (
            <TableRow key={i}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                {l.name}
                <div className="font-mono text-xs text-muted-foreground">{l.sku}</div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatQty(l.qtyMilli)} {l.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(l.unitPricePaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{l.discountPaise ? formatINR(l.discountPaise) : "-"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatINR(l.lineTotalPaise)}</TableCell>
              {showReturns && (
                <TableCell className="text-right tabular-nums print:hidden">
                  {"returnedQtyMilli" in l && l.returnedQtyMilli ? formatQty(l.returnedQtyMilli) : "-"}
                </TableCell>
              )}
              {showCost && (
                <TableCell className="text-right tabular-nums print:hidden">
                  {"costOfGoodsPaise" in l ? formatINR(l.costOfGoodsPaise) : "-"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={5} className="text-right">
              Subtotal
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatINR(totals.subtotalPaise)}</TableCell>
            {extraCols > 0 && <TableCell colSpan={extraCols} className="print:hidden" />}
          </TableRow>
          {totals.billDiscountPaise > 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-right">
                Bill discount
              </TableCell>
              <TableCell className="text-right tabular-nums">-{formatINR(totals.billDiscountPaise)}</TableCell>
              {extraCols > 0 && <TableCell colSpan={extraCols} className="print:hidden" />}
            </TableRow>
          )}
          <TableRow>
            <TableCell colSpan={5} className="text-right font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">{formatINR(totals.totalPaise)}</TableCell>
            {extraCols > 0 && <TableCell colSpan={extraCols} className="print:hidden" />}
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

export function AmountRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatINR(value)}</span>
    </div>
  );
}
