"use client";

import Link from "next/link";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Field, MoneyInput, NativeSelect } from "@/components/forms";
import { MethodSelect } from "@/components/invoice/invoice-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { parseRupees } from "@/lib/money";
import type { PaymentMethod } from "@/server/types";

export function ExpenseFormDialog({ categories }: { categories: { id: string; name: string }[] }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(businessDate());
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Add expense
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add expense</DialogTitle>
        </DialogHeader>
        {categories.length === 0 ? (
          <p className="text-sm">
            Create an expense category first.{" "}
            <Link href="/expenses/categories" className="underline">
              Manage categories
            </Link>
          </p>
        ) : (
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const done = await run(
                () =>
                  api("/api/expenses", "POST", {
                    categoryId,
                    amountPaise: parseRupees(amount),
                    method,
                    businessDate: date,
                    description,
                    idempotencyKey: key,
                  }),
                { success: "Expense added" },
              );
              if (done) {
                setOpen(false);
                setAmount("");
                setDescription("");
                setKey(newIdempotencyKey());
              }
            }}
          >
            <Field label="Category" htmlFor="expCategory">
              <NativeSelect id="expCategory" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Amount" htmlFor="expAmount">
              <MoneyInput id="expAmount" required value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Paid by" htmlFor="expMethod">
              <MethodSelect id="expMethod" value={method} onChange={setMethod} />
            </Field>
            <Field label="Date" htmlFor="expDate">
              <Input id="expDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="expDescription" className="col-span-2">
              <Input id="expDescription" value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button type="submit" className="col-span-2" disabled={pending}>
              Save expense
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function VoidExpenseButton({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        const reason = window.prompt("Why is this expense being voided?");
        if (reason && reason.trim().length >= 3) {
          void run(() => api(`/api/expenses/${id}/void`, "POST", { reason }), { success: "Expense voided" });
        }
      }}
    >
      Void
    </Button>
  );
}
