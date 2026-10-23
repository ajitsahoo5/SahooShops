import { describe, expect, it } from "vitest";
import { COL, col } from "@/server/collections";
import { ledgerTotals } from "@/server/inventory/ledger";
import { createParty } from "@/server/parties/service";
import { createPurchase, reversePurchase } from "@/server/purchases/service";
import { createSale, postSaleDraft, reverseSale } from "@/server/sales/service";
import type {
  BalanceStatsDoc,
  DailySummaryDoc,
  InventoryStatsDoc,
  PartyDoc,
  PaymentDoc,
  PurchaseDoc,
  SaleDoc,
} from "@/server/types";
import { actor, docData, key, makeProduct, product, TODAY } from "../support/fixtures";

async function supplier() {
  return (await createParty(actor, "supplier", { name: "Ganesh Traders", phone: "", email: "", address: "", notes: "", active: true })).id;
}
async function customer() {
  return (await createParty(actor, "customer", { name: "Ravi Kumar", phone: "", email: "", address: "", notes: "", active: true })).id;
}

function saleInput(productId: string, qtyMilli: number, overrides: Partial<Parameters<typeof createSale>[1]> = {}) {
  return {
    action: "post" as const,
    customerId: null,
    businessDate: TODAY,
    items: [{ productId, qtyMilli, unitPricePaise: 2_000, discountPaise: 0 }],
    billDiscountPaise: 0,
    notes: "",
    payment: { method: "cash" as const, amountPaise: (qtyMilli / 1000) * 2_000 },
    idempotencyKey: key(),
    ...overrides,
  };
}

describe("purchases", () => {
  it("adds stock at net cost and updates weighted average and payable", async () => {
    const supplierId = await supplier();
    const productId = await makeProduct({ qty: 10_000, unitCost: 1_000 });
    const { id, number } = await createPurchase(actor, {
      action: "post",
      supplierId,
      supplierInvoiceNo: "GT-991",
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 10_000, unitPricePaise: 2_200, discountPaise: 2_000 }],
      billDiscountPaise: 0,
      notes: "",
      payment: { method: "upi", amountPaise: 5_000 },
      idempotencyKey: key(),
    });
    expect(number).toBe("PUR-000001");
    expect(await product(productId)).toMatchObject({
      stockQtyMilli: 20_000,
      stockValuePaise: 30_000,
      purchaseCostPaise: 2_000,
    });
    const purchase = await docData<PurchaseDoc>(COL.purchases, id);
    expect(purchase).toMatchObject({ status: "posted", paidPaise: 5_000, duePaise: 15_000, isOpen: true });
    expect((await docData<PartyDoc>(COL.suppliers, supplierId)).balancePaise).toBe(15_000);
    expect((await docData<BalanceStatsDoc>(COL.stats, "balances")).payablePaise).toBe(15_000);
    const summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ purchasesCount: 1, purchasesPaise: 20_000, cashOut: { upi: 5_000 } });
  });

  it("blocks reversing a purchase whose stock was already sold", async () => {
    const supplierId = await supplier();
    const productId = await makeProduct({ qty: 0 });
    const { id } = await createPurchase(actor, {
      action: "post",
      supplierId,
      supplierInvoiceNo: "",
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 5_000, unitPricePaise: 1_000, discountPaise: 0 }],
      billDiscountPaise: 0,
      notes: "",
      payment: null,
      idempotencyKey: key(),
    });
    await createSale(actor, saleInput(productId, 3_000));
    await expect(reversePurchase(actor, id, { reason: "Wrong supplier", refundMethod: "cash", idempotencyKey: key() })).rejects.toThrow(
      /Not enough stock/,
    );
    expect((await docData<PurchaseDoc>(COL.purchases, id)).status).toBe("posted");
  });

  it("reverses a purchase and refunds what was paid", async () => {
    const supplierId = await supplier();
    const productId = await makeProduct({ qty: 0 });
    const { id } = await createPurchase(actor, {
      action: "post",
      supplierId,
      supplierInvoiceNo: "",
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 5_000, unitPricePaise: 1_000, discountPaise: 0 }],
      billDiscountPaise: 0,
      notes: "",
      payment: { method: "cash", amountPaise: 2_000 },
      idempotencyKey: key(),
    });
    await reversePurchase(actor, id, { reason: "Returned to supplier", refundMethod: "bank", idempotencyKey: key() });
    expect(await product(productId)).toMatchObject({ stockQtyMilli: 0, stockValuePaise: 0 });
    expect((await docData<PartyDoc>(COL.suppliers, supplierId)).balancePaise).toBe(0);
    const refunds = await col(COL.payments).where("kind", "==", "refund").get();
    expect(refunds.docs.map((d) => d.data() as PaymentDoc)).toMatchObject([{ direction: "in", method: "bank", amountPaise: 2_000 }]);
  });
});

describe("sales", () => {
  it("removes stock at average cost and snapshots cost of goods", async () => {
    const productId = await makeProduct({ qty: 3_000, unitCost: 333 }); // 3 units worth ₹9.99
    const { id, number } = await createSale(actor, saleInput(productId, 1_000));
    expect(number).toBe("INV-000001");
    const sale = await docData<SaleDoc>(COL.sales, id);
    expect(sale.items[0].costOfGoodsPaise).toBe(333);
    expect(sale).toMatchObject({ status: "posted", paidPaise: 2_000, duePaise: 0, costOfGoodsPaise: 333 });
    expect(await product(productId)).toMatchObject({ stockQtyMilli: 2_000, stockValuePaise: 666 });
    const summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ salesCount: 1, salesPaise: 2_000, salesCogsPaise: 333, cashIn: { cash: 2_000 } });
    expect(summary.productSales[productId]).toEqual({ qtyMilli: 1_000, revenuePaise: 2_000, cogsPaise: 333 });
    expect((await docData<InventoryStatsDoc>(COL.stats, "inventory")).valuePaise).toBe(666);
  });

  it("requires walk-in sales to be paid in full but allows credit for customers", async () => {
    const productId = await makeProduct({ qty: 5_000 });
    await expect(createSale(actor, saleInput(productId, 1_000, { payment: null }))).rejects.toThrow(/Walk-in/);
    const customerId = await customer();
    const { id } = await createSale(actor, saleInput(productId, 2_000, { customerId, payment: { method: "upi", amountPaise: 1_000 } }));
    expect(await docData<SaleDoc>(COL.sales, id)).toMatchObject({ paidPaise: 1_000, duePaise: 3_000, isOpen: true });
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(3_000);
  });

  it("allocates bill discount across lines", async () => {
    const a = await makeProduct({ qty: 10_000 });
    const b = await makeProduct({ qty: 10_000 });
    const { id } = await createSale(actor, {
      ...saleInput(a, 1_000),
      items: [
        { productId: a, qtyMilli: 3_000, unitPricePaise: 1_000, discountPaise: 0 },
        { productId: b, qtyMilli: 1_000, unitPricePaise: 1_000, discountPaise: 0 },
      ],
      billDiscountPaise: 400,
      payment: { method: "cash", amountPaise: 3_600 },
    });
    const sale = await docData<SaleDoc>(COL.sales, id);
    expect(sale.totals.totalPaise).toBe(3_600);
    expect(sale.items.map((l) => l.netPaise)).toEqual([2_700, 900]);
  });

  it("rejects overselling without writing anything", async () => {
    const a = await makeProduct({ qty: 5_000 });
    const b = await makeProduct({ qty: 1_000 });
    await expect(
      createSale(actor, {
        ...saleInput(a, 1_000),
        items: [
          { productId: a, qtyMilli: 2_000, unitPricePaise: 1_000, discountPaise: 0 },
          { productId: b, qtyMilli: 2_000, unitPricePaise: 1_000, discountPaise: 0 },
        ],
        payment: { method: "cash", amountPaise: 4_000 },
      }),
    ).rejects.toThrow(/Not enough stock/);
    expect((await product(a)).stockQtyMilli).toBe(5_000);
    expect((await col(COL.sales).get()).size).toBe(0);
    expect((await col(COL.counters).doc("sale").get()).exists).toBe(false);
  });

  it("does not post twice for a retried request", async () => {
    const productId = await makeProduct({ qty: 5_000 });
    const input = saleInput(productId, 1_000);
    const [first, second] = await Promise.all([createSale(actor, input), createSale(actor, input)]);
    expect(second.id).toBe(first.id);
    expect((await col(COL.sales).get()).size).toBe(1);
    expect((await product(productId)).stockQtyMilli).toBe(4_000);
  });

  it("never oversells under concurrent sales", async () => {
    const productId = await makeProduct({ qty: 5_000, unitCost: 1_000 });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => createSale(actor, saleInput(productId, 1_000))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(5);
    for (const r of results) {
      if (r.status === "rejected") expect(String(r.reason)).toMatch(/Not enough stock/);
    }
    const p = await product(productId);
    expect(p).toMatchObject({ stockQtyMilli: 0, stockValuePaise: 0, stockStatus: "out" });
    expect(await ledgerTotals(productId)).toMatchObject({ qtyMilli: 0, valuePaise: 0, count: 6 });
    const numbers = new Set(
      ok.map((r) => (r as PromiseFulfilledResult<{ number: string | null }>).value.number),
    );
    expect(numbers.size).toBe(5);
    const summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ salesCount: 5, salesPaise: 10_000, salesCogsPaise: 5_000 });
  });

  it("posts a draft once and refuses to post it again", async () => {
    const productId = await makeProduct({ qty: 5_000 });
    const draft = await createSale(actor, { ...saleInput(productId, 1_000), action: "draft" });
    expect(draft.number).toBeNull();
    expect((await product(productId)).stockQtyMilli).toBe(5_000);
    const posted = await postSaleDraft(actor, draft.id, { payment: { method: "cash", amountPaise: 2_000 }, idempotencyKey: key() });
    expect(posted.number).toBe("INV-000001");
    await expect(
      postSaleDraft(actor, draft.id, { payment: { method: "cash", amountPaise: 2_000 }, idempotencyKey: key() }),
    ).rejects.toThrow(/already posted/);
    expect((await product(productId)).stockQtyMilli).toBe(4_000);
  });

  it("reverses a sale: restores stock at original cost, refunds, and clears totals", async () => {
    const customerId = await customer();
    const productId = await makeProduct({ qty: 4_000, unitCost: 1_000 });
    const { id } = await createSale(actor, saleInput(productId, 2_000, { customerId, payment: { method: "cash", amountPaise: 1_500 } }));
    await reverseSale(actor, id, { reason: "Entered by mistake", refundMethod: "cash", idempotencyKey: key() });
    expect(await product(productId)).toMatchObject({ stockQtyMilli: 4_000, stockValuePaise: 4_000 });
    expect(await docData<SaleDoc>(COL.sales, id)).toMatchObject({ status: "reversed", duePaise: 0, refundedPaise: 1_500 });
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(0);
    const summary = await docData<DailySummaryDoc>(COL.dailySummaries, TODAY);
    expect(summary).toMatchObject({ salesCount: 0, salesPaise: 0, salesCogsPaise: 0 });
    expect(summary.cashIn.cash).toBe(1_500);
    expect(summary.cashOut.cash).toBe(1_500);
    await expect(reverseSale(actor, id, { reason: "Again", refundMethod: "cash", idempotencyKey: key() })).rejects.toThrow(
      /Only posted/,
    );
  });
});
