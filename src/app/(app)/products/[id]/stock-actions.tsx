"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, MoneyInput, NativeSelect, QtyInput } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { paiseToInput, parseRupees } from "@/lib/money";
import { parseQty } from "@/lib/qty";

export function AdjustStockDialog({ productId, unit }: { productId: string; unit: string }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [direction, setDirection] = useState<"in" | "out">("out");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(businessDate());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const done = await run(
      () =>
        api("/api/stock/adjustments", "POST", {
          productId,
          direction,
          qtyMilli: parseQty(qty),
          unitCostPaise: direction === "in" && cost.trim() ? parseRupees(cost) : null,
          reason,
          businessDate: date,
          idempotencyKey: key,
        }),
      { success: "Stock adjusted" },
    );
    if (done) {
      setOpen(false);
      setKey(newIdempotencyKey());
      setQty("");
      setCost("");
      setReason("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Adjust stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Use for damage, loss, counting corrections, or found stock. Stock out is valued at the current average cost.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="Direction" htmlFor="direction">
            <NativeSelect id="direction" value={direction} onChange={(e) => setDirection(e.target.value as "in" | "out")}>
              <option value="out">Remove stock</option>
              <option value="in">Add stock</option>
            </NativeSelect>
          </Field>
          <Field label={`Quantity (${unit})`} htmlFor="adjQty">
            <QtyInput id="adjQty" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          {direction === "in" && (
            <Field label="Unit cost" htmlFor="adjCost" hint="Leave blank to use the average cost." className="col-span-2">
              <MoneyInput id="adjCost" value={cost} onChange={(e) => setCost(e.target.value)} />
            </Field>
          )}
          <Field label="Date" htmlFor="adjDate">
            <Input id="adjDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Reason" htmlFor="adjReason" className="col-span-2">
            <Input id="adjReason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button type="submit" className="col-span-2" disabled={pending}>
            {pending ? "Saving..." : "Save adjustment"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OpeningStockDialog({ productId, defaultCost }: { productId: string; defaultCost: number }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState(defaultCost ? paiseToInput(defaultCost) : "");
  const [date, setDate] = useState(businessDate());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const done = await run(
      () =>
        api(`/api/products/${productId}/opening-stock`, "POST", {
          qtyMilli: parseQty(qty),
          unitCostPaise: parseRupees(cost || "0"),
          businessDate: date,
          idempotencyKey: key,
        }),
      { success: "Opening stock recorded" },
    );
    if (done) setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Set opening stock</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opening stock</DialogTitle>
          <DialogDescription>Record the quantity on hand when you started using Sahoo Shop.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-3 gap-3">
          <Field label="Quantity" htmlFor="osQty">
            <QtyInput id="osQty" required value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Unit cost" htmlFor="osCost">
            <MoneyInput id="osCost" value={cost} onChange={(e) => setCost(e.target.value)} />
          </Field>
          <Field label="As of" htmlFor="osDate">
            <Input id="osDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Button type="submit" className="col-span-3" disabled={pending}>
            Save opening stock
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  return (
    <Button
      variant="destructive"
      disabled={pending}
      onClick={async () => {
        if (!window.confirm("Delete this product? This is only possible before it has any stock history.")) return;
        const done = await run(() => api(`/api/products/${productId}`, "DELETE"), { success: "Product deleted", refresh: false });
        if (done) router.push("/products");
      }}
    >
      Delete
    </Button>
  );
}
