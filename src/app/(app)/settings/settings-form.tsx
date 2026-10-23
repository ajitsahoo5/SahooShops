"use client";

import { useState } from "react";
import { Field } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api-client";
import type { SettingsInput } from "@/lib/schemas/settings";

export function SettingsForm({ initial }: { initial: SettingsInput }) {
  const { pending, run } = useAction();
  const [form, setForm] = useState(initial);
  const set = (patch: Partial<SettingsInput>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <form
      className="grid max-w-3xl gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        await run(() => api("/api/settings", "PUT", form), { success: "Settings saved" });
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Shop details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Shop name" htmlFor="shopName">
            <Input id="shopName" required value={form.shopName} onChange={(e) => set({ shopName: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="shopPhone">
            <Input id="shopPhone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Address (printed on invoices)" htmlFor="shopAddress" className="sm:col-span-2">
            <Textarea id="shopAddress" rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Numbering</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Field label="Sales invoice prefix" htmlFor="invoicePrefix" hint="For example INV-000123">
            <Input id="invoicePrefix" value={form.invoicePrefix} onChange={(e) => set({ invoicePrefix: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Purchase prefix" htmlFor="purchasePrefix">
            <Input id="purchasePrefix" value={form.purchasePrefix} onChange={(e) => set({ purchasePrefix: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Sales return prefix" htmlFor="returnPrefix">
            <Input id="returnPrefix" value={form.returnPrefix} onChange={(e) => set({ returnPrefix: e.target.value.toUpperCase() })} />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stock control</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.allowNegativeStock}
              onChange={(e) => set({ allowNegativeStock: e.target.checked })}
            />
            <span>
              Allow selling more than the recorded stock (negative stock).
              <span className="block text-xs text-muted-foreground">
                Off by default. Turn on only if goods are sometimes sold before the purchase is entered. Purchase reversals
                are always blocked when stock is short.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
