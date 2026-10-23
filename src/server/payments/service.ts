import "server-only";
import type { DocumentReference, Query } from "firebase-admin/firestore";
import { DomainError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import type { PaymentListQuery, RecordPaymentInput } from "@/lib/schemas/payment";
import type { Actor } from "../auth";
import { COL, col, withId } from "../collections";
import { readPartyTx } from "../parties/service";
import { runPosting } from "../posting/context";
import type { PaymentAllocation, PaymentDoc, PurchaseDoc, SaleDoc, WithId } from "../types";
import { writeMoneyRecord } from "./records";

type OpenInvoice = { ref: DocumentReference; data: SaleDoc | PurchaseDoc };

/**
 * Records money received from a customer or paid to a supplier. The amount is applied to one
 * invoice, or to the party's oldest open invoices first, and reduces the party balance.
 */
export async function recordPartyPayment(actor: Actor, input: RecordPaymentInput): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "payment.record", async (ctx) => {
    const { tx } = ctx;
    const isCustomer = input.partyType === "customer";
    const invoiceCol = isCustomer ? COL.sales : COL.purchases;
    const partyField = isCustomer ? "customerId" : "supplierId";
    const party = await readPartyTx(tx, input.partyType, input.partyId);

    let invoices: OpenInvoice[];
    if (input.invoiceId) {
      const ref = col(invoiceCol).doc(input.invoiceId);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new DomainError("NOT_FOUND", "Invoice not found.");
      const data = snap.data() as SaleDoc | PurchaseDoc;
      if ((data as unknown as Record<string, unknown>)[partyField] !== input.partyId) {
        throw new DomainError("VALIDATION", "This invoice belongs to a different party.");
      }
      if (data.status !== "posted") throw new DomainError("INVALID_STATE", "Payments can only be applied to posted invoices.");
      invoices = [{ ref, data }];
    } else {
      const snap = await tx.get(
        col(invoiceCol).where(partyField, "==", input.partyId).where("isOpen", "==", true).orderBy("businessDate", "asc").limit(200),
      );
      invoices = snap.docs
        .map((d) => ({ ref: d.ref, data: d.data() as SaleDoc | PurchaseDoc }))
        .sort((a, b) => a.data.businessDate.localeCompare(b.data.businessDate) || a.data.createdAt.localeCompare(b.data.createdAt));
    }
    const outstanding = invoices.reduce((s, i) => s + i.data.duePaise, 0);
    if (outstanding <= 0) throw new DomainError("INVALID_STATE", "There is nothing outstanding to pay.");
    if (input.amountPaise > outstanding) {
      throw new DomainError("VALIDATION", `Amount is more than the outstanding ${formatINR(outstanding)}.`);
    }

    let remaining = input.amountPaise;
    const allocations: PaymentAllocation[] = [];
    for (const inv of invoices) {
      if (remaining === 0) break;
      const amount = Math.min(remaining, inv.data.duePaise);
      if (amount <= 0) continue;
      remaining -= amount;
      const due = inv.data.duePaise - amount;
      tx.update(inv.ref, { paidPaise: inv.data.paidPaise + amount, duePaise: due, isOpen: due > 0, updatedAt: ctx.now });
      allocations.push({
        refType: isCustomer ? "sale" : "purchase",
        refId: inv.ref.id,
        number: inv.data.number ?? "",
        amountPaise: amount,
      });
    }

    const id = writeMoneyRecord(ctx, {
      kind: isCustomer ? "receipt" : "payment",
      direction: isCustomer ? "in" : "out",
      method: input.method,
      amountPaise: input.amountPaise,
      partyType: input.partyType,
      partyId: input.partyId,
      partyName: party.name,
      allocations,
      refType: null,
      refId: null,
      businessDate: input.businessDate,
      notes: input.notes,
    });
    ctx.partyBalance(input.partyType, input.partyId, -input.amountPaise);
    ctx.audit("payment.record", "payment", id, `${isCustomer ? "Received" : "Paid"} ${formatINR(input.amountPaise)} ${isCustomer ? "from" : "to"} ${party.name}`, {
      allocations,
    });
    return { id };
  });
}

/**
 * Reverses a mistaken receipt or supplier payment. The original day's cash total is corrected,
 * invoice balances are reopened, and the party balance is restored.
 */
export async function reversePayment(
  actor: Actor,
  paymentId: string,
  input: { reason: string; idempotencyKey: string },
): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "payment.reverse", async (ctx) => {
    const { tx } = ctx;
    const ref = col(COL.payments).doc(paymentId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Payment not found.");
    const payment = snap.data() as PaymentDoc;
    if (payment.status !== "active") throw new DomainError("INVALID_STATE", "This payment is already reversed.");
    if (payment.kind !== "receipt" && payment.kind !== "payment") {
      throw new DomainError("INVALID_STATE", "Only receipts and supplier payments can be reversed.");
    }
    if (!payment.partyType || !payment.partyId) {
      throw new DomainError("INVALID_STATE", "Walk-in receipts cannot be reversed. Reverse the sale instead.");
    }
    const invoiceRefs = payment.allocations.map((a) => col(a.refType === "sale" ? COL.sales : COL.purchases).doc(a.refId));
    const invoiceSnaps = invoiceRefs.length ? await tx.getAll(...invoiceRefs) : [];
    const invoices = invoiceSnaps.map((s, i) => {
      if (!s.exists) throw new DomainError("NOT_FOUND", "An invoice for this payment no longer exists.");
      const data = s.data() as SaleDoc | PurchaseDoc;
      if (data.status !== "posted") {
        throw new DomainError("INVALID_STATE", `Invoice ${data.number} has been reversed, so its payments cannot be reversed.`);
      }
      return { ref: invoiceRefs[i], data, amount: payment.allocations[i].amountPaise };
    });

    for (const inv of invoices) {
      tx.update(inv.ref, {
        paidPaise: inv.data.paidPaise - inv.amount,
        duePaise: inv.data.duePaise + inv.amount,
        isOpen: true,
        updatedAt: ctx.now,
      });
    }
    const reversalId = writeMoneyRecord(ctx, {
      kind: "reversal",
      direction: payment.direction === "in" ? "out" : "in",
      method: payment.method,
      amountPaise: payment.amountPaise,
      partyType: payment.partyType,
      partyId: payment.partyId,
      partyName: payment.partyName,
      refType: "payment",
      refId: paymentId,
      businessDate: payment.businessDate,
      reason: input.reason,
      reversalOf: paymentId,
      affectsSummary: false,
    });
    ctx.summary(
      payment.businessDate,
      payment.direction === "in"
        ? { cashIn: { [payment.method]: -payment.amountPaise } }
        : { cashOut: { [payment.method]: -payment.amountPaise } },
    );
    tx.update(ref, { status: "reversed", reversedBy: reversalId, reason: input.reason });
    ctx.partyBalance(payment.partyType, payment.partyId, payment.amountPaise);
    ctx.audit("payment.reverse", "payment", paymentId, `Reversed payment of ${formatINR(payment.amountPaise)}: ${input.reason}`);
    return { id: reversalId };
  });
}

export async function listPayments(filters: Partial<PaymentListQuery> & { limit?: number }): Promise<WithId<PaymentDoc>[]> {
  let query: Query = col(COL.payments);
  if (filters.method) query = query.where("method", "==", filters.method);
  if (filters.kind) query = query.where("kind", "==", filters.kind);
  if (filters.from) query = query.where("businessDate", ">=", filters.from);
  if (filters.to) query = query.where("businessDate", "<=", filters.to);
  const snap = await query.orderBy("businessDate", "desc").limit(filters.limit ?? 300).get();
  return snap.docs
    .map((d) => withId<PaymentDoc>(d))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.localeCompare(a.createdAt));
}

export async function listPartyPayments(partyId: string, limit = 200): Promise<WithId<PaymentDoc>[]> {
  const snap = await col(COL.payments).where("partyId", "==", partyId).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((d) => withId<PaymentDoc>(d));
}
