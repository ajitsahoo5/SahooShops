"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2Icon } from "lucide-react";
import { Field, MoneyInput, NativeSelect, QtyInput } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { computeInvoice } from "@/lib/invoice-math";
import { formatINR, paiseToInput, tryParseRupees } from "@/lib/money";
import { formatQty, qtyToInput, tryParseQty } from "@/lib/qty";
import type { ProductView } from "@/server/products/view";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/server/types";
import { ProductPicker } from "./product-picker";

export type EditorLine = {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  stockQtyMilli: number;
  qtyMilli: number;
  unitPricePaise: number;
  discountPaise: number;
};

export type EditorDraft = {
  id: string;
  partyId: string | null;
  businessDate: string;
  supplierInvoiceNo?: string;
  billDiscountPaise: number;
  notes: string;
  items: EditorLine[];
};

type LineState = {
  key: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  stockQtyMilli: number;
  qty: string;
  price: string;
  discount: string;
};

function toLineState(l: EditorLine): LineState {
  return {
    key: crypto.randomUUID(),
    productId: l.productId,
    sku: l.sku,
    name: l.name,
    unit: l.unit,
    stockQtyMilli: l.stockQtyMilli,
    qty: qtyToInput(l.qtyMilli),
    price: paiseToInput(l.unitPricePaise),
    discount: l.discountPaise ? paiseToInput(l.discountPaise) : "",
  };
}

export function InvoiceEditor({
  kind,
  parties,
  draft,
}: {
  kind: "sale" | "purchase";
  parties: { id: string; name: string }[];
  draft?: EditorDraft;
}) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [idempotencyKey] = useState(newIdempotencyKey);
  const isSale = kind === "sale";
  const endpoint = isSale ? "/api/sales" : "/api/purchases";

  const [partyId, setPartyId] = useState(draft?.partyId ?? "");
  const [date, setDate] = useState(draft?.businessDate ?? businessDate());
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(draft?.supplierInvoiceNo ?? "");
  const [billDiscount, setBillDiscount] = useState(draft?.billDiscountPaise ? paiseToInput(draft.billDiscountPaise) : "");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [lines, setLines] = useState<LineState[]>(() => draft?.items.map(toLineState) ?? []);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paidInFull, setPaidInFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState("");

  const parsed = useMemo(() => {
    const items = lines.map((l) => ({
      productId: l.productId,
      qtyMilli: tryParseQty(l.qty) ?? 0,
      unitPricePaise: tryParseRupees(l.price) ?? 0,
      discountPaise: tryParseRupees(l.discount) ?? 0,
    }));
    const bill = tryParseRupees(billDiscount) ?? 0;
    try {
      return { items, bill, ...computeInvoice(items, bill), error: null as string | null };
    } catch (error) {
      return { items, bill, lines: null, totals: null, error: (error as Error).message };
    }
  }, [lines, billDiscount]);

  const total = parsed.totals?.totalPaise ?? 0;
  const paidPaise = paidInFull ? total : tryParseRupees(paidAmount) ?? 0;

  function addProduct(p: ProductView) {
    setLines((current) => [
      ...current,
      {
        key: crypto.randomUUID(),
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unit: p.unit,
        stockQtyMilli: p.stockQtyMilli,
        qty: "1",
        price: paiseToInput(isSale ? p.sellingPricePaise : p.purchaseCostPaise),
        discount: "",
      },
    ]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function submit(action: "draft" | "post") {
    await run(
      async () => {
        if (lines.length === 0) throw new Error("Add at least one item.");
        for (const [i, l] of lines.entries()) {
          if (!tryParseQty(l.qty) || tryParseQty(l.qty)! <= 0) throw new Error(`Line ${i + 1}: enter a quantity.`);
          if (tryParseRupees(l.price) === null) throw new Error(`Line ${i + 1}: enter a valid price.`);
        }
        if (parsed.error) throw new Error(parsed.error);
        if (!isSale && !partyId) throw new Error("Choose a supplier.");
        const body = {
          businessDate: date,
          items: parsed.items,
          billDiscountPaise: parsed.bill,
          notes,
          ...(isSale ? { customerId: partyId || null } : { supplierId: partyId, supplierInvoiceNo }),
        };
        const payment = action === "post" && paidPaise > 0 ? { method, amountPaise: paidPaise } : null;
        let id: string;
        if (draft) {
          await api(`${endpoint}/${draft.id}`, "PUT", body);
          if (action === "post") await api(`${endpoint}/${draft.id}/post`, "POST", { payment, idempotencyKey });
          id = draft.id;
        } else {
          ({ id } = await api<{ id: string }>(endpoint, "POST", { ...body, action, payment, idempotencyKey }));
        }
        router.push(`/${isSale ? "sales" : "purchases"}/${id}`);
      },
      { success: action === "post" ? (isSale ? "Sale posted" : "Purchase posted") : "Draft saved", refresh: false },
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <Field label={isSale ? "Customer" : "Supplier"} htmlFor="party">
              <NativeSelect id="party" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">{isSale ? "Walk-in customer" : "Choose supplier"}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="date">
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            {!isSale && (
              <Field label="Supplier bill no." htmlFor="supplierInvoiceNo">
                <Input id="supplierInvoiceNo" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
              </Field>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ProductPicker onSelect={addProduct} priceField={isSale ? "sellingPricePaise" : "purchaseCostPaise"} />
            {lines.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1 pr-2 font-normal">Product</th>
                      <th className="w-24 py-1 pr-2 text-right font-normal">Qty</th>
                      <th className="w-28 py-1 pr-2 text-right font-normal">{isSale ? "Price" : "Unit cost"}</th>
                      <th className="w-28 py-1 pr-2 text-right font-normal">Discount</th>
                      <th className="w-28 py-1 text-right font-normal">Amount</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => {
                      const qtyMilli = tryParseQty(l.qty) ?? 0;
                      const short = isSale && qtyMilli > l.stockQtyMilli;
                      return (
                        <tr key={l.key} className="border-t align-top">
                          <td className="py-2 pr-2">
                            <div className="font-medium">{l.name}</div>
                            <div className={`text-xs ${short ? "text-destructive" : "text-muted-foreground"}`}>
                              {l.sku} · in stock {formatQty(l.stockQtyMilli)} {l.unit}
                              {short && " · not enough stock"}
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <QtyInput aria-label={`Quantity line ${i + 1}`} value={l.qty} onChange={(e) => updateLine(l.key, { qty: e.target.value })} />
                          </td>
                          <td className="py-2 pr-2">
                            <MoneyInput aria-label={`Price line ${i + 1}`} value={l.price} onChange={(e) => updateLine(l.key, { price: e.target.value })} />
                          </td>
                          <td className="py-2 pr-2">
                            <MoneyInput aria-label={`Discount line ${i + 1}`} value={l.discount} placeholder="0.00" onChange={(e) => updateLine(l.key, { discount: e.target.value })} />
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {parsed.lines ? formatINR(parsed.lines[i].lineTotalPaise) : "-"}
                          </td>
                          <td className="py-2 pl-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Remove line"
                              onClick={() => setLines((c) => c.filter((x) => x.key !== l.key))}
                            >
                              <Trash2Icon />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatINR(parsed.totals?.subtotalPaise ?? 0)}</span>
          </div>
          <Field label="Bill discount" htmlFor="billDiscount">
            <MoneyInput id="billDiscount" value={billDiscount} placeholder="0.00" onChange={(e) => setBillDiscount(e.target.value)} />
          </Field>
          <div className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums" data-testid="invoice-total">
              {formatINR(total)}
            </span>
          </div>
          {parsed.error && <p className="text-destructive">{parsed.error}</p>}
          <hr />
          <Field label="Payment method" htmlFor="method">
            <NativeSelect id="method" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={paidInFull} onChange={(e) => setPaidInFull(e.target.checked)} />
            Paid in full now
          </label>
          {!paidInFull && (
            <Field
              label="Amount paid now"
              htmlFor="paidAmount"
              hint={isSale ? "The rest is added to the customer's balance." : "The rest is added to the amount you owe the supplier."}
            >
              <MoneyInput id="paidAmount" value={paidAmount} placeholder="0.00" onChange={(e) => setPaidAmount(e.target.value)} />
            </Field>
          )}
          <div className="flex justify-between text-muted-foreground">
            <span>On credit</span>
            <span className="tabular-nums">{formatINR(Math.max(0, total - paidPaise))}</span>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button type="button" disabled={pending} onClick={() => submit("post")}>
              {pending ? "Saving..." : isSale ? "Post sale" : "Post purchase"}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => submit("draft")}>
              Save as draft
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
