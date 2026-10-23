import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { businessDate, monthKeyOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { computeInvoice } from "@/lib/invoice-math";
import { formatINR, mulDivRound } from "@/lib/money";
import { QTY_SCALE } from "@/lib/qty";
import type {
  CreatePurchaseInput,
  InitialPayment,
  PurchaseDraftInput,
  ReverseInvoiceInput,
} from "@/lib/schemas/invoice";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col } from "../collections";
import { db } from "../firebaseAdmin";
import { readPartyTx } from "../parties/service";
import { writeMoneyRecord } from "../payments/records";
import { runPosting, type PostingContext } from "../posting/context";
import type { InvoiceLine, PartyDoc, PurchaseDoc, WithId } from "../types";

export type PostResult = { id: string; number: string | null };

function draftInputOf(p: PurchaseDoc): PurchaseDraftInput {
  return {
    supplierId: p.supplierId,
    supplierInvoiceNo: p.supplierInvoiceNo,
    businessDate: p.businessDate,
    items: p.items.map(({ productId, qtyMilli, unitPricePaise, discountPaise }) => ({
      productId,
      qtyMilli,
      unitPricePaise,
      discountPaise,
    })),
    billDiscountPaise: p.billDiscountPaise,
    notes: p.notes,
  };
}

function buildPurchaseDoc(
  ctx: PostingContext,
  input: PurchaseDraftInput,
  supplier: WithId<PartyDoc>,
  existing: PurchaseDoc | null,
): PurchaseDoc {
  const { lines, totals } = computeInvoice(input.items, input.billDiscountPaise);
  const items: InvoiceLine[] = input.items.map((item, i) => {
    const p = ctx.product(item.productId);
    return { ...item, sku: p.sku, name: p.name, unit: p.unit, ...lines[i] };
  });
  return {
    status: "draft",
    number: null,
    businessDate: input.businessDate,
    monthKey: monthKeyOf(input.businessDate),
    supplierId: supplier.id,
    supplierName: supplier.name,
    supplierInvoiceNo: input.supplierInvoiceNo,
    items,
    billDiscountPaise: input.billDiscountPaise,
    totals,
    paidPaise: 0,
    duePaise: 0,
    isOpen: false,
    refundedPaise: 0,
    notes: input.notes,
    archived: false,
    archivedAt: null,
    archiveBatchId: null,
    createdAt: existing?.createdAt ?? ctx.now,
    updatedAt: ctx.now,
    postedAt: null,
    reversedAt: null,
    reversalReason: null,
  };
}

async function readDraftInputs(ctx: PostingContext, input: PurchaseDraftInput) {
  const supplier = await readPartyTx(ctx.tx, "supplier", input.supplierId);
  await ctx.loadProducts(input.items.map((i) => i.productId));
  return supplier;
}

/** Posts a purchase: adds stock at net line cost, records payment and payable. */
async function postPurchase(
  ctx: PostingContext,
  ref: DocumentReference,
  input: PurchaseDraftInput,
  payment: InitialPayment,
  existing: PurchaseDoc | null,
): Promise<PostResult> {
  const supplier = await readDraftInputs(ctx, input);
  const number = await ctx.reserveNumber("purchase", ctx.settings.purchasePrefix);

  const purchase = buildPurchaseDoc(ctx, input, supplier, existing);
  const total = purchase.totals.totalPaise;
  const paid = payment?.amountPaise ?? 0;
  if (paid > total) throw new DomainError("VALIDATION", "Payment is more than the purchase total.");

  for (const line of purchase.items) {
    ctx.move(
      line.productId,
      { kind: "in", qtyMilli: line.qtyMilli, valuePaise: line.netPaise },
      { type: "PURCHASE", refType: "purchase", refId: ref.id, refNumber: number, businessDate: input.businessDate },
    );
    ctx.setLastCost(line.productId, mulDivRound(line.netPaise, QTY_SCALE, line.qtyMilli));
  }

  const due = total - paid;
  ctx.tx.set(ref, {
    ...purchase,
    status: "posted",
    number,
    paidPaise: paid,
    duePaise: due,
    isOpen: due > 0,
    postedAt: ctx.now,
  } satisfies PurchaseDoc);

  if (paid > 0 && payment) {
    writeMoneyRecord(ctx, {
      kind: "payment",
      direction: "out",
      method: payment.method,
      amountPaise: paid,
      partyType: "supplier",
      partyId: supplier.id,
      partyName: supplier.name,
      allocations: [{ refType: "purchase", refId: ref.id, number, amountPaise: paid }],
      refType: "purchase",
      refId: ref.id,
      businessDate: input.businessDate,
    });
  }
  if (due > 0) ctx.partyBalance("supplier", supplier.id, due);
  ctx.summary(input.businessDate, { purchasesCount: 1, purchasesPaise: total });
  ctx.audit("purchase.post", "purchase", ref.id, `Posted purchase ${number} for ${formatINR(total)}`, { paid, due });
  return { id: ref.id, number };
}

export async function createPurchase(actor: Actor, input: CreatePurchaseInput): Promise<PostResult> {
  const draft: PurchaseDraftInput = {
    supplierId: input.supplierId,
    supplierInvoiceNo: input.supplierInvoiceNo,
    businessDate: input.businessDate,
    items: input.items,
    billDiscountPaise: input.billDiscountPaise,
    notes: input.notes,
  };
  if (input.action === "post") {
    return runPosting(actor, input.idempotencyKey, "purchase.post", (ctx) =>
      postPurchase(ctx, col(COL.purchases).doc(), draft, input.payment, null),
    );
  }
  return runPosting(actor, input.idempotencyKey, "purchase.draft", async (ctx) => {
    const supplier = await readDraftInputs(ctx, draft);
    const ref = col(COL.purchases).doc();
    ctx.tx.set(ref, buildPurchaseDoc(ctx, draft, supplier, null));
    ctx.audit("purchase.draft", "purchase", ref.id, "Saved purchase draft");
    return { id: ref.id, number: null };
  });
}

async function readDraft(ctx: PostingContext, id: string) {
  const ref = col(COL.purchases).doc(id);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new DomainError("NOT_FOUND", "Purchase not found.");
  const purchase = snap.data() as PurchaseDoc;
  if (purchase.status !== "draft") throw new DomainError("INVALID_STATE", "This purchase is already posted.");
  return { ref, purchase };
}

export async function updatePurchaseDraft(actor: Actor, id: string, input: PurchaseDraftInput): Promise<void> {
  await runPosting(actor, undefined, "purchase.draft.update", async (ctx) => {
    const { ref, purchase } = await readDraft(ctx, id);
    const supplier = await readDraftInputs(ctx, input);
    ctx.tx.set(ref, buildPurchaseDoc(ctx, input, supplier, purchase));
    ctx.audit("purchase.draft.update", "purchase", id, "Updated purchase draft");
  });
}

export async function postPurchaseDraft(
  actor: Actor,
  id: string,
  input: { payment: InitialPayment; idempotencyKey: string },
): Promise<PostResult> {
  return runPosting(actor, input.idempotencyKey, "purchase.post", async (ctx) => {
    const { ref, purchase } = await readDraft(ctx, id);
    return postPurchase(ctx, ref, draftInputOf(purchase), input.payment, purchase);
  });
}

export async function deletePurchaseDraft(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.purchases).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Purchase not found.");
    if ((snap.data() as PurchaseDoc).status !== "draft") {
      throw new DomainError("INVALID_STATE", "Posted purchases cannot be deleted. Reverse it instead.");
    }
    tx.delete(ref);
    writeAudit(tx, actor, "purchase.draft.delete", "purchase", id, "Deleted purchase draft");
  });
}

/**
 * Reverses a posted purchase: removes the purchased stock at its original value (blocked when
 * that stock has already been sold), clears the payable, and records any supplier refund today.
 */
export async function reversePurchase(actor: Actor, id: string, input: ReverseInvoiceInput): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "purchase.reverse", async (ctx) => {
    const ref = col(COL.purchases).doc(id);
    const snap = await ctx.tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Purchase not found.");
    const purchase = snap.data() as PurchaseDoc;
    if (purchase.status !== "posted") throw new DomainError("INVALID_STATE", "Only posted purchases can be reversed.");
    await ctx.loadProducts(purchase.items.map((l) => l.productId));
    const today = businessDate();

    for (const line of purchase.items) {
      ctx.move(
        line.productId,
        { kind: "outValue", qtyMilli: line.qtyMilli, valuePaise: line.netPaise },
        {
          type: "PURCHASE_REVERSAL",
          refType: "purchase",
          refId: id,
          refNumber: purchase.number ?? undefined,
          businessDate: today,
          note: input.reason,
        },
      );
    }
    if (purchase.duePaise > 0) ctx.partyBalance("supplier", purchase.supplierId, -purchase.duePaise);
    if (purchase.paidPaise > 0) {
      writeMoneyRecord(ctx, {
        kind: "refund",
        direction: "in",
        method: input.refundMethod,
        amountPaise: purchase.paidPaise,
        partyType: "supplier",
        partyId: purchase.supplierId,
        partyName: purchase.supplierName,
        refType: "purchase",
        refId: id,
        businessDate: today,
        reason: `Reversal of ${purchase.number}: ${input.reason}`,
      });
    }
    ctx.tx.update(ref, {
      status: "reversed",
      reversedAt: ctx.now,
      reversalReason: input.reason,
      duePaise: 0,
      isOpen: false,
      refundedPaise: purchase.refundedPaise + purchase.paidPaise,
      updatedAt: ctx.now,
    });
    ctx.summary(purchase.businessDate, { purchasesCount: -1, purchasesPaise: -purchase.totals.totalPaise });
    ctx.audit("purchase.reverse", "purchase", id, `Reversed purchase ${purchase.number}: ${input.reason}`, {
      refundedPaise: purchase.paidPaise,
    });
    return { id };
  });
}
