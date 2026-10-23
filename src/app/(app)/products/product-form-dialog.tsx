"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Field, MoneyInput, NativeSelect, QtyInput } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { paiseToInput, parseRupees } from "@/lib/money";
import { parseQty, qtyToInput } from "@/lib/qty";
import { UNIT_SUGGESTIONS } from "@/lib/schemas/product";
import type { ProductView } from "@/server/products/view";

type CategoryOption = { id: string; name: string };

export function ProductFormDialog({ categories, product }: { categories: CategoryOption[]; product?: ProductView }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const editing = Boolean(product);

  const [form, setForm] = useState(() => ({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    categoryId: product?.categoryId ?? "",
    unit: product?.unit ?? "pcs",
    purchaseCost: product ? paiseToInput(product.purchaseCostPaise) : "",
    sellingPrice: product ? paiseToInput(product.sellingPricePaise) : "",
    reorderLevel: product ? qtyToInput(product.reorderLevelMilli) : "0",
    active: product?.active ?? true,
    openingQty: "",
    openingCost: "",
    openingDate: businessDate(),
  }));
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await run(
      async () => {
        const fields = {
          sku: form.sku,
          name: form.name,
          categoryId: form.categoryId || null,
          unit: form.unit,
          purchaseCostPaise: parseRupees(form.purchaseCost || "0"),
          sellingPricePaise: parseRupees(form.sellingPrice || "0"),
          reorderLevelMilli: parseQty(form.reorderLevel || "0"),
          active: form.active,
        };
        if (product) {
          await api(`/api/products/${product.id}`, "PUT", fields);
          setOpen(false);
          return;
        }
        const openingStock = form.openingQty.trim()
          ? {
              qtyMilli: parseQty(form.openingQty),
              unitCostPaise: parseRupees(form.openingCost || form.purchaseCost || "0"),
              businessDate: form.openingDate,
            }
          : null;
        const { id } = await api<{ id: string }>("/api/products", "POST", {
          ...fields,
          openingStock,
          idempotencyKey: key,
        });
        setOpen(false);
        setKey(newIdempotencyKey());
        router.push(`/products/${id}`);
      },
      { success: editing ? "Product updated" : "Product created" },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline">Edit product</Button>
        ) : (
          <Button>
            <PlusIcon /> New product
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field label="SKU" htmlFor="sku">
            <Input id="sku" required value={form.sku} onChange={(e) => set({ sku: e.target.value })} />
          </Field>
          <Field label="Unit" htmlFor="unit">
            <Input id="unit" list="unit-suggestions" required value={form.unit} onChange={(e) => set({ unit: e.target.value })} />
            <datalist id="unit-suggestions">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Field>
          <Field label="Name" htmlFor="name" className="col-span-2">
            <Input id="name" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Category" htmlFor="categoryId" className="col-span-2">
            <NativeSelect id="categoryId" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Purchase cost (per unit)" htmlFor="purchaseCost">
            <MoneyInput id="purchaseCost" value={form.purchaseCost} onChange={(e) => set({ purchaseCost: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Selling price (per unit)" htmlFor="sellingPrice">
            <MoneyInput id="sellingPrice" value={form.sellingPrice} onChange={(e) => set({ sellingPrice: e.target.value })} placeholder="0.00" />
          </Field>
          <Field label="Reorder level" htmlFor="reorderLevel" hint="Low-stock alert at or below this quantity.">
            <QtyInput id="reorderLevel" value={form.reorderLevel} onChange={(e) => set({ reorderLevel: e.target.value })} />
          </Field>
          {editing && (
            <label className="mt-6 flex items-center gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(v) => set({ active: v === true })} /> Active
            </label>
          )}
          {!editing && (
            <fieldset className="col-span-2 grid grid-cols-3 gap-3 rounded-lg border p-3">
              <legend className="px-1 text-xs text-muted-foreground">Opening stock (optional)</legend>
              <Field label="Quantity" htmlFor="openingQty">
                <QtyInput id="openingQty" value={form.openingQty} onChange={(e) => set({ openingQty: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Unit cost" htmlFor="openingCost">
                <MoneyInput id="openingCost" value={form.openingCost} onChange={(e) => set({ openingCost: e.target.value })} placeholder={form.purchaseCost || "0.00"} />
              </Field>
              <Field label="As of" htmlFor="openingDate">
                <Input id="openingDate" type="date" value={form.openingDate} onChange={(e) => set({ openingDate: e.target.value })} />
              </Field>
            </fieldset>
          )}
          <DialogFooter className="col-span-2 mx-0 mb-0 rounded-none border-0 bg-transparent p-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
