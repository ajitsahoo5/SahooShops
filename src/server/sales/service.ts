import "server-only";
import type { DocumentReference } from "firebase-admin/firestore";
import { businessDate, monthKeyOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { computeInvoice } from "@/lib/invoice-math";
import { formatINR } from "@/lib/money";
import type { CreateSaleInput, InitialPayment, ReverseInvoiceInput, SaleDraftInput } from "@/lib/schemas/invoice";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col } from "../collections";
import { db } from "../firebaseAdmin";
import { readPartyTx } from "../parties/service";
import { writeMoneyRecord } from "../payments/records";
import { runPosting, type PostingContext } from "../posting/context";
import type { PartyDoc, SaleDoc, SaleLine, WithId } from "../types";

export type PostResult = { id: string; number: string | null };

function draftInputOf(sale: SaleDoc): SaleDraftInput {
  return {
    customerId: sale.customerId,
    businessDate: sale.businessDate,
    items: sale.items.map(({ productId, qtyMilli, unitPricePaise, discountPaise }) => ({
      productId,
      qtyMilli,
      unitPricePaise,
      discountPaise,
    })),
    billDiscountPaise: sale.billDiscountPaise,
    notes: sale.notes,
  };
}

function buildSaleDoc(
  ctx: PostingContext,
  input: SaleDraftInput,
  customer: WithId<PartyDoc> | null,
  existing: SaleDoc | null,
): SaleDoc {
  const { lines, totals } = computeInvoice(input.items, input.billDiscountPaise);
  const items: SaleLine[] = input.items.map((item, i) => {
    const p = ctx.product(item.productId);
    return {
      ...item,
      sku: p.sku,
      name: p.name,
      unit: p.unit,
      ...lines[i],
      costOfGoodsPaise: 0,
      returnedQtyMilli: 0,
      returnedValuePaise: 0,
      returnedCogsPaise: 0,
    };
  });
  return {
    status: "draft",
    number: null,
    businessDate: input.businessDate,
    monthKey: monthKeyOf(input.businessDate),
    customerId: customer?.id ?? null,
    customerName: customer?.name ?? null,
    items,
    billDiscountPaise: input.billDiscountPaise,
    totals,
    paidPaise: 0,
    duePaise: 0,
    isOpen: false,
    costOfGoodsPaise: 0,
    returnedPaise: 0,
    returnedCogsPaise: 0,
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

async function readDraftInputs(ctx: PostingContext, input: SaleDraftInput) {
  const customer = input.customerId ? await readPartyTx(ctx.tx, "customer", input.customerId) : null;
  await ctx.loadProducts(input.items.map((i) => i.productId));
  return customer;
}

/** Posts a sale: removes stock at average cost, records payment and receivable. */
async function postSale(
  ctx: PostingContext,
  ref: DocumentReference,
  input: SaleDraftInput,
  payment: InitialPayment,
  existing: SaleDoc | null,
): Promise<PostResult> {
  // Read phase.
  const customer = await readDraftInputs(ctx, input);
  const number = await ctx.reserveNumber("sale", ctx.settings.invoicePrefix);

  // Validation.
  for (const item of input.items) {
    const p = ctx.product(item.productId);
    if (!p.active) throw new DomainError("VALIDATION", `${p.name} is inactive and cannot be sold.`);
  }
  if (customer && !customer.active) throw new DomainError("VALIDATION", `${customer.name} is inactive.`);
  const sale = buildSaleDoc(ctx, input, customer, existing);
  const total = sale.totals.totalPaise;
  const paid = payment?.amountPaise ?? 0;
  if (paid > total) throw new DomainError("VALIDATION", "Payment is more than the invoice total.");
  if (!customer && paid !== total) {
    throw new DomainError("VALIDATION", "Walk-in sales must be paid in full. Choose a customer to sell on credit.");
  }

  // Write phase.
  let cogs = 0;
  sale.items = sale.items.map((line) => {
    const outcome = ctx.move(
      line.productId,
      { kind: "outAverage", qtyMilli: line.qtyMilli },
      { type: "SALE", refType: "sale", refId: ref.id, refNumber: number, businessDate: input.businessDate },
    );
    const lineCogs = -outcome.valueDeltaPaise;
    cogs += lineCogs;
    ctx.summary(input.businessDate, {
      productSales: { [line.productId]: { qtyMilli: line.qtyMilli, revenuePaise: line.netPaise, cogsPaise: lineCogs } },
    });
    return { ...line, costOfGoodsPaise: lineCogs };
  });

  const due = total - paid;
  const posted: SaleDoc = {
    ...sale,
    status: "posted",
    number,
    costOfGoodsPaise: cogs,
    paidPaise: paid,
    duePaise: due,
    isOpen: due > 0,
    postedAt: ctx.now,
  };
  ctx.tx.set(ref, posted);

  if (paid > 0 && payment) {
    writeMoneyRecord(ctx, {
      kind: "receipt",
      direction: "in",
      method: payment.method,
      amountPaise: paid,
      partyType: customer ? "customer" : null,
      partyId: customer?.id ?? null,
      partyName: customer?.name ?? null,
      allocations: [{ refType: "sale", refId: ref.id, number, amountPaise: paid }],
      refType: "sale",
      refId: ref.id,
      businessDate: input.businessDate,
    });
  }
  if (due > 0 && customer) ctx.partyBalance("customer", customer.id, due);
  ctx.summary(input.businessDate, { salesCount: 1, salesPaise: total, salesCogsPaise: cogs });
  ctx.audit("sale.post", "sale", ref.id, `Posted sale ${number} for ${formatINR(total)}`, { paid, due });
  return { id: ref.id, number };
}

export async function createSale(actor: Actor, input: CreateSaleInput): Promise<PostResult> {
  const draft: SaleDraftInput = {
    customerId: input.customerId,
    businessDate: input.businessDate,
    items: input.items,
    billDiscountPaise: input.billDiscountPaise,
    notes: input.notes,
  };
  if (input.action === "post") {
    return runPosting(actor, input.idempotencyKey, "sale.post", (ctx) =>
      postSale(ctx, col(COL.sales).doc(), draft, input.payment, null),
    );
  }
  return runPosting(actor, input.idempotencyKey, "sale.draft", async (ctx) => {
    const customer = await readDraftInputs(ctx, draft);
    const ref = col(COL.sales).doc();
    ctx.tx.set(ref, buildSaleDoc(ctx, draft, customer, null));
    ctx.audit("sale.draft", "sale", ref.id, "Saved sale draft");
    return { id: ref.id, number: null };
  });
}

async function readDraft(ctx: PostingContext, id: string): Promise<{ ref: DocumentReference; sale: SaleDoc }> {
  const ref = col(COL.sales).doc(id);
  const snap = await ctx.tx.get(ref);
  if (!snap.exists) throw new DomainError("NOT_FOUND", "Sale not found.");
  const sale = snap.data() as SaleDoc;
  if (sale.status !== "draft") throw new DomainError("INVALID_STATE", "This sale is already posted.");
  return { ref, sale };
}

export async function updateSaleDraft(actor: Actor, id: string, input: SaleDraftInput): Promise<void> {
  await runPosting(actor, undefined, "sale.draft.update", async (ctx) => {
    const { ref, sale } = await readDraft(ctx, id);
    const customer = await readDraftInputs(ctx, input);
    ctx.tx.set(ref, buildSaleDoc(ctx, input, customer, sale));
    ctx.audit("sale.draft.update", "sale", id, "Updated sale draft");
  });
}

export async function postSaleDraft(
  actor: Actor,
  id: string,
  input: { payment: InitialPayment; idempotencyKey: string },
): Promise<PostResult> {
  return runPosting(actor, input.idempotencyKey, "sale.post", async (ctx) => {
    const { ref, sale } = await readDraft(ctx, id);
    return postSale(ctx, ref, draftInputOf(sale), input.payment, sale);
  });
}

export async function deleteSaleDraft(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.sales).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Sale not found.");
    if ((snap.data() as SaleDoc).status !== "draft") {
      throw new DomainError("INVALID_STATE", "Posted sales cannot be deleted. Reverse it instead.");
    }
    tx.delete(ref);
    writeAudit(tx, actor, "sale.draft.delete", "sale", id, "Deleted sale draft");
  });
}

/**
 * Reverses a posted sale: stock comes back at the original cost of goods, the receivable is
 * cleared, any money received is refunded today, and the sale drops out of its day's totals.
 */
export async function reverseSale(actor: Actor, id: string, input: ReverseInvoiceInput): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "sale.reverse", async (ctx) => {
    const ref = col(COL.sales).doc(id);
    const snap = await ctx.tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Sale not found.");
    const sale = snap.data() as SaleDoc;
    if (sale.status !== "posted") throw new DomainError("INVALID_STATE", "Only posted sales can be reversed.");
    if (sale.returnedPaise > 0 || sale.items.some((l) => l.returnedQtyMilli > 0)) {
      throw new DomainError("INVALID_STATE", "This sale has returns. Return the remaining items instead of reversing.");
    }
    await ctx.loadProducts(sale.items.map((l) => l.productId));
    const today = businessDate();

    for (const line of sale.items) {
      ctx.move(
        line.productId,
        { kind: "in", qtyMilli: line.qtyMilli, valuePaise: line.costOfGoodsPaise },
        {
          type: "SALE_REVERSAL",
          refType: "sale",
          refId: id,
          refNumber: sale.number ?? undefined,
          businessDate: today,
          note: input.reason,
        },
      );
      ctx.summary(sale.businessDate, {
        productSales: {
          [line.productId]: { qtyMilli: -line.qtyMilli, revenuePaise: -line.netPaise, cogsPaise: -line.costOfGoodsPaise },
        },
      });
    }
    if (sale.duePaise > 0 && sale.customerId) ctx.partyBalance("customer", sale.customerId, -sale.duePaise);
    if (sale.paidPaise > 0) {
      writeMoneyRecord(ctx, {
        kind: "refund",
        direction: "out",
        method: input.refundMethod,
        amountPaise: sale.paidPaise,
        partyType: sale.customerId ? "customer" : null,
        partyId: sale.customerId,
        partyName: sale.customerName,
        refType: "sale",
        refId: id,
        businessDate: today,
        reason: `Reversal of ${sale.number}: ${input.reason}`,
      });
    }
    ctx.tx.update(ref, {
      status: "reversed",
      reversedAt: ctx.now,
      reversalReason: input.reason,
      duePaise: 0,
      isOpen: false,
      refundedPaise: sale.refundedPaise + sale.paidPaise,
      updatedAt: ctx.now,
    });
    ctx.summary(sale.businessDate, {
      salesCount: -1,
      salesPaise: -sale.totals.totalPaise,
      salesCogsPaise: -sale.costOfGoodsPaise,
    });
    ctx.audit("sale.reverse", "sale", id, `Reversed sale ${sale.number}: ${input.reason}`, {
      refundedPaise: sale.paidPaise,
    });
    return { id };
  });
}
