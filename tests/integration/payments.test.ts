import { describe, expect, it } from "vitest";
import { COL, col } from "@/server/collections";
import { createExpense, createExpenseCategory, voidExpense } from "@/server/expenses/service";
import { ledgerTotals } from "@/server/inventory/ledger";
import { createParty } from "@/server/parties/service";
import { recordPartyPayment, reversePayment } from "@/server/payments/service";
import { createSaleReturn } from "@/server/sales/returns";
import { createSale, reverseSale } from "@/server/sales/service";
import type { BalanceStatsDoc, DailySummaryDoc, PartyDoc, PaymentDoc, SaleDoc } from "@/server/types";
import { actor, docData, key, makeProduct, product, TODAY } from "../support/fixtures";

async function customer() {
  return (await createParty(actor, "customer", { name: "Meena Stores", phone: "", email: "", address: "", notes: "", active: true })).id;
}

async function creditSale(customerId: string, productId: string, qtyMilli: number, date = TODAY, paid = 0) {
  return createSale(actor, {
    action: "post",
    customerId,
    businessDate: date,
    items: [{ productId, qtyMilli, unitPricePaise: 1_000, discountPaise: 0 }],
    billDiscountPaise: 0,
    notes: "",
    payment: paid ? { method: "cash", amountPaise: paid } : null,
    idempotencyKey: key(),
  });
}

describe("customer payments", () => {
  it("applies payments to the oldest invoices first", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 100_000 });
    const older = await creditSale(customerId, productId, 3_000, "2026-10-01");
    const newer = await creditSale(customerId, productId, 5_000, "2026-10-10");
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(8_000);

    await recordPartyPayment(actor, {
      partyType: "customer",
      partyId: customerId,
      method: "upi",
      amountPaise: 4_000,
      businessDate: TODAY,
      invoiceId: null,
      notes: "",
      idempotencyKey: key(),
    });
    expect(await docData<SaleDoc>(COL.sales, older.id)).toMatchObject({ paidPaise: 3_000, duePaise: 0, isOpen: false });
    expect(await docData<SaleDoc>(COL.sales, newer.id)).toMatchObject({ paidPaise: 1_000, duePaise: 4_000, isOpen: true });
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(4_000);
    expect((await docData<BalanceStatsDoc>(COL.stats, "balances")).receivablePaise).toBe(4_000);
    expect((await docData<DailySummaryDoc>(COL.dailySummaries, TODAY)).cashIn.upi).toBe(4_000);
  });

  it("rejects paying more than is outstanding", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 10_000 });
    await creditSale(customerId, productId, 1_000);
    await expect(
      recordPartyPayment(actor, {
        partyType: "customer",
        partyId: customerId,
        method: "cash",
        amountPaise: 5_000,
        businessDate: TODAY,
        invoiceId: null,
        notes: "",
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/more than the outstanding/);
  });

  it("reverses a payment and reopens the invoices", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 10_000 });
    const sale = await creditSale(customerId, productId, 2_000);
    const { id } = await recordPartyPayment(actor, {
      partyType: "customer",
      partyId: customerId,
      method: "cash",
      amountPaise: 2_000,
      businessDate: TODAY,
      invoiceId: sale.id,
      notes: "",
      idempotencyKey: key(),
    });
    await reversePayment(actor, id, { reason: "Cheque bounced", idempotencyKey: key() });
    expect(await docData<SaleDoc>(COL.sales, sale.id)).toMatchObject({ paidPaise: 0, duePaise: 2_000, isOpen: true });
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(2_000);
    expect((await docData<PaymentDoc>(COL.payments, id)).status).toBe("reversed");
    expect((await docData<DailySummaryDoc>(COL.dailySummaries, TODAY)).cashIn.cash).toBe(0);
    await expect(reversePayment(actor, id, { reason: "Again", idempotencyKey: key() })).rejects.toThrow(/already reversed/);
  });

  it("blocks reversing a payment on a reversed invoice", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 10_000 });
    const sale = await creditSale(customerId, productId, 2_000);
    const { id } = await recordPartyPayment(actor, {
      partyType: "customer",
      partyId: customerId,
      method: "cash",
      amountPaise: 1_000,
      businessDate: TODAY,
      invoiceId: sale.id,
      notes: "",
      idempotencyKey: key(),
    });
    await reverseSale(actor, sale.id, { reason: "Cancelled order", refundMethod: "cash", idempotencyKey: key() });
    await expect(reversePayment(actor, id, { reason: "Mistake", idempotencyKey: key() })).rejects.toThrow(/has been reversed/);
  });
});

describe("sales returns", () => {
  it("returns in parts that add up exactly to the line", async () => {
    const productId = await makeProduct({ qty: 3_000, unitCost: 333 });
    const sale = await createSale(actor, {
      action: "post",
      customerId: null,
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 3_000, unitPricePaise: 1_000, discountPaise: 1 }],
      billDiscountPaise: 0,
      notes: "",
      payment: { method: "cash", amountPaise: 2_999 },
      idempotencyKey: key(),
    });
    for (let i = 0; i < 3; i++) {
      await createSaleReturn(actor, sale.id, {
        businessDate: TODAY,
        items: [{ lineIndex: 0, qtyMilli: 1_000 }],
        refundMethod: "cash",
        reason: "Customer changed mind",
        idempotencyKey: key(),
      });
    }
    const s = await docData<SaleDoc>(COL.sales, sale.id);
    expect(s.returnedPaise).toBe(2_999);
    expect(s.returnedCogsPaise).toBe(999);
    expect(s.refundedPaise).toBe(2_999);
    expect(await product(productId)).toMatchObject({ stockQtyMilli: 3_000, stockValuePaise: 999 });
    expect(await ledgerTotals(productId)).toMatchObject({ qtyMilli: 3_000, valuePaise: 999 });
    await expect(
      createSaleReturn(actor, sale.id, {
        businessDate: TODAY,
        items: [{ lineIndex: 0, qtyMilli: 1_000 }],
        refundMethod: "cash",
        reason: "Too many",
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/can still be returned/);
    const summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ returnsPaise: 2_999, returnsCogsPaise: 999 });
    expect(summary.productSales[productId]).toEqual({ qtyMilli: 0, revenuePaise: 0, cogsPaise: 0 });
  });

  it("reduces the amount due before refunding", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 10_000 });
    const sale = await creditSale(customerId, productId, 10_000, TODAY, 2_000); // total 10,000, due 8,000
    await createSaleReturn(actor, sale.id, {
      businessDate: TODAY,
      items: [{ lineIndex: 0, qtyMilli: 9_000 }],
      refundMethod: "upi",
      reason: "Damaged in transit",
      idempotencyKey: key(),
    });
    const s = await docData<SaleDoc>(COL.sales, sale.id);
    expect(s).toMatchObject({ returnedPaise: 9_000, duePaise: 0, refundedPaise: 1_000, isOpen: false });
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(0);
    const refunds = await col(COL.payments).where("kind", "==", "refund").get();
    expect(refunds.docs.map((d) => d.data())).toMatchObject([{ method: "upi", amountPaise: 1_000, direction: "out" }]);
  });
});

describe("expenses", () => {
  it("records and voids expenses in the daily summary", async () => {
    const { id: categoryId } = await createExpenseCategory(actor, "Electricity");
    const { id } = await createExpense(actor, {
      categoryId,
      businessDate: TODAY,
      amountPaise: 150_000,
      method: "bank",
      description: "October bill",
      idempotencyKey: key(),
    });
    let summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ expensesPaise: 150_000, cashOut: { bank: 150_000 } });
    await voidExpense(actor, id, "Entered twice");
    summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ expensesPaise: 0, cashOut: { bank: 0 } });
    await expect(voidExpense(actor, id, "Again")).rejects.toThrow(/already voided/);
  });
});
