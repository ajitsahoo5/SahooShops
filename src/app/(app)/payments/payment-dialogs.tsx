"use client";

import { useState } from "react";
import { Field, MoneyInput, NativeSelect } from "@/components/forms";
import { MethodSelect } from "@/components/invoice/invoice-actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { api, newIdempotencyKey } from "@/lib/api-client";
import { businessDate } from "@/lib/dates";
import { formatINR, paiseToInput, parseRupees } from "@/lib/money";
import type { PartyType, PaymentMethod } from "@/server/types";

function PaymentForm({
  partyType,
  partyId,
  invoiceId,
  defaultAmount,
  onDone,
}: {
  partyType: PartyType;
  partyId: string;
  invoiceId?: string;
  defaultAmount: number;
  onDone: () => void;
}) {
  const { pending, run } = useAction();
  const [key, setKey] = useState(newIdempotencyKey);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState(defaultAmount ? paiseToInput(defaultAmount) : "");
  const [date, setDate] = useState(businessDate());
  const [notes, setNotes] = useState("");

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const done = await run(
          () =>
            api("/api/payments", "POST", {
              partyType,
              partyId,
              invoiceId: invoiceId ?? null,
              method,
              amountPaise: parseRupees(amount),
              businessDate: date,
              notes,
              idempotencyKey: key,
            }),
          { success: "Payment recorded" },
        );
        if (done) {
          setKey(newIdempotencyKey());
          onDone();
        }
      }}
    >
      <Field label="Amount" htmlFor="payAmount">
        <MoneyInput id="payAmount" required value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Method" htmlFor="payMethod">
        <MethodSelect id="payMethod" value={method} onChange={setMethod} />
      </Field>
      <Field label="Date" htmlFor="payDate">
        <Input id="payDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Notes" htmlFor="payNotes">
        <Input id="payNotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" className="col-span-2" disabled={pending}>
        Save payment
      </Button>
    </form>
  );
}

export function ReceivePaymentDialog({
  partyType,
  partyId,
  invoiceId,
  defaultAmount,
  label,
}: {
  partyType: PartyType;
  partyId: string;
  invoiceId?: string;
  defaultAmount: number;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Outstanding {formatINR(defaultAmount)}.{" "}
            {invoiceId ? "Applied to this invoice." : "Applied to the oldest unpaid invoices first."}
          </DialogDescription>
        </DialogHeader>
        <PaymentForm
          partyType={partyType}
          partyId={partyId}
          invoiceId={invoiceId}
          defaultAmount={defaultAmount}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

type PartyOption = { id: string; name: string; balancePaise: number };

export function RecordPaymentDialog({ customers, suppliers }: { customers: PartyOption[]; suppliers: PartyOption[] }) {
  const [open, setOpen] = useState(false);
  const [partyType, setPartyType] = useState<PartyType>("customer");
  const [partyId, setPartyId] = useState("");
  const options = (partyType === "customer" ? customers : suppliers).filter((p) => p.balancePaise > 0);
  const selected = options.find((p) => p.id === partyId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Record payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>Collect from a customer or pay a supplier against their outstanding balance.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type" htmlFor="partyType">
            <NativeSelect
              id="partyType"
              value={partyType}
              onChange={(e) => {
                setPartyType(e.target.value as PartyType);
                setPartyId("");
              }}
            >
              <option value="customer">Receive from customer</option>
              <option value="supplier">Pay supplier</option>
            </NativeSelect>
          </Field>
          <Field label={partyType === "customer" ? "Customer" : "Supplier"} htmlFor="partyPick">
            <NativeSelect id="partyPick" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">Choose...</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatINR(p.balancePaise)})
                </option>
              ))}
            </NativeSelect>
          </Field>
        </div>
        {options.length === 0 && <p className="text-sm text-muted-foreground">Nobody has an outstanding balance.</p>}
        {selected && (
          <PaymentForm
            key={selected.id}
            partyType={partyType}
            partyId={selected.id}
            defaultAmount={selected.balancePaise}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReversePaymentButton({ paymentId }: { paymentId: string }) {
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Reverse
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reverse payment</DialogTitle>
          <DialogDescription>
            Use this when a payment was recorded by mistake. The invoices it paid become due again.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const done = await run(() => api(`/api/payments/${paymentId}/reverse`, "POST", { reason, idempotencyKey: key }), {
              success: "Payment reversed",
            });
            if (done) setOpen(false);
          }}
        >
          <Field label="Reason" htmlFor="payReverseReason">
            <Textarea id="payReverseReason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button type="submit" variant="destructive" disabled={pending}>
            Reverse payment
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
