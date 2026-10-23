"use client";

import { useState } from "react";
import { Field, QtyInput } from "@/components/forms";
import { MethodSelect } from "@/components/invoice/invoice-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { proRataPortion } from "@/lib/invoice-math";
import { formatINR } from "@/lib/money";
import { formatQty, tryParseQty } from "@/lib/qty";
import type { PaymentMethod, SaleLine } from "@/server/types";

export function SaleReturnDialog({ sale, hasCustomer }: { sale: { id: string; items: SaleLine[] }; hasCustomer: boolean }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(businessDate());

  const chosen = sale.items
    .map((line, lineIndex) => ({ line, lineIndex, qtyMilli: tryParseQty(qty[lineIndex] ?? "") ?? 0 }))
    .filter((x) => x.qtyMilli > 0);
  const value = chosen.reduce(
    (s, x) => s + proRataPortion(x.line.netPaise, x.line.qtyMilli, x.line.returnedQtyMilli, Math.min(x.qtyMilli, x.line.qtyMilli - x.line.returnedQtyMilli)),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Sales return</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Sales return</DialogTitle>
          <DialogDescription>
            Returned items go back into stock at their original cost.{" "}
            {hasCustomer ? "The value first reduces what the customer owes; any excess is refunded." : "The value is refunded."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await run(
              () =>
                api(`/api/sales/${sale.id}/returns`, "POST", {
                  businessDate: date,
                  items: chosen.map((x) => ({ lineIndex: x.lineIndex, qtyMilli: x.qtyMilli })),
                  refundMethod: method,
                  reason,
                  idempotencyKey: key,
                }),
              { success: "Return recorded" },
            );
            if (done) {
              setOpen(false);
              setQty({});
              setReason("");
              setKey(newIdempotencyKey());
            }
          }}
        >
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="font-normal">Item</th>
                <th className="text-right font-normal">Can return</th>
                <th className="w-28 text-right font-normal">Return qty</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((line, i) => {
                const remaining = line.qtyMilli - line.returnedQtyMilli;
                return (
                  <tr key={i} className="border-t">
                    <td className="py-2">{line.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatQty(remaining)} {line.unit}
                    </td>
                    <td className="py-2 pl-2">
                      <QtyInput
                        aria-label={`Return quantity for ${line.name}`}
                        disabled={remaining <= 0}
                        value={qty[i] ?? ""}
                        placeholder="0"
                        onChange={(e) => setQty((q) => ({ ...q, [i]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-right text-sm">
            Return value: <strong className="tabular-nums">{formatINR(value)}</strong>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" htmlFor="retDate">
              <Input id="retDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Refund method" htmlFor="retMethod">
              <MethodSelect id="retMethod" value={method} onChange={setMethod} />
            </Field>
            <Field label="Reason" htmlFor="retReason" className="col-span-2">
              <Input id="retReason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          </div>
          <Button type="submit" disabled={pending || chosen.length === 0}>
            Record return
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
