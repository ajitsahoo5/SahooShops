"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, MoneyInput, NativeSelect } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from "@/server/types";

type Kind = "sale" | "purchase";

function base(kind: Kind) {
  return kind === "sale" ? "/api/sales" : "/api/purchases";
}

export function MethodSelect({ id, value, onChange }: { id: string; value: PaymentMethod; onChange: (m: PaymentMethod) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as PaymentMethod)}>
      {PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {PAYMENT_METHOD_LABELS[m]}
        </option>
      ))}
    </NativeSelect>
  );
}

export function PostDraftDialog({ kind, id, total, hasParty }: { kind: Kind; id: string; total: number; hasParty: boolean }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(paiseToInput(total));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Post</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post {kind}</DialogTitle>
          <DialogDescription>
            Posting updates stock and balances. Total {formatINR(total)}.
            {kind === "sale" && !hasParty && " Walk-in sales must be paid in full."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const amountPaise = parseRupees(amount || "0");
            const done = await run(
              () =>
                api(`${base(kind)}/${id}/post`, "POST", {
                  payment: amountPaise > 0 ? { method, amountPaise } : null,
                  idempotencyKey: key,
                }),
              { success: "Posted" },
            );
            if (done) setOpen(false);
          }}
        >
          <Field label="Method" htmlFor="postMethod">
            <MethodSelect id="postMethod" value={method} onChange={setMethod} />
          </Field>
          <Field label="Paid now" htmlFor="postAmount">
            <MoneyInput id="postAmount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Button type="submit" className="col-span-2" disabled={pending}>
            Confirm and post
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReverseDialog({ kind, id, paidPaise }: { kind: Kind; id: string; paidPaise: number }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Reverse</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse this {kind}?</DialogTitle>
          <DialogDescription>
            {kind === "sale"
              ? "Stock is returned at its original cost, the customer balance is cleared, and the sale is removed from its day's totals."
              : "The purchased stock is removed at its original cost and the supplier balance is cleared. This is blocked if the stock has already been sold."}
            {paidPaise > 0 && ` ${formatINR(paidPaise)} was paid and will be recorded as a refund today.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await run(
              () => api(`${base(kind)}/${id}/reverse`, "POST", { reason, refundMethod: method, idempotencyKey: key }),
              { success: "Reversed" },
            );
            if (done) setOpen(false);
          }}
        >
          <Field label="Reason" htmlFor="reverseReason">
            <Textarea id="reverseReason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {paidPaise > 0 && (
            <Field label="Refund method" htmlFor="refundMethod">
              <MethodSelect id="refundMethod" value={method} onChange={setMethod} />
            </Field>
          )}
          <Button type="submit" variant="destructive" disabled={pending}>
            Reverse {kind}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DraftActions({ kind, id }: { kind: Kind; id: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const path = kind === "sale" ? "sales" : "purchases";
  return (
    <>
      <Button asChild variant="outline">
        <Link href={`/${path}/${id}/edit`}>Edit draft</Link>
      </Button>
      <Button
        variant="ghost"
        disabled={pending}
        onClick={async () => {
          if (!window.confirm("Delete this draft?")) return;
          const done = await run(() => api(`${base(kind)}/${id}`, "DELETE"), { success: "Draft deleted", refresh: false });
          if (done) router.push(`/${path}`);
        }}
      >
        Delete draft
      </Button>
    </>
  );
}

export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      Print
    </Button>
  );
}
