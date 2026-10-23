import { describe, expect, it } from "vitest";
import {
  commitArchive,
  createArchivePreview,
  generateArchive,
  getBatch,
  verifyArchive,
} from "@/server/archive/service";
import { COL, col } from "@/server/collections";
import { storageBucket } from "@/server/firebaseAdmin";
import { listInvoices } from "@/server/invoices/queries";
import { createParty } from "@/server/parties/service";
import { recordPartyPayment } from "@/server/payments/service";
import { createPurchase } from "@/server/purchases/service";
import { buildReport } from "@/server/reports/builders";
import { createSale } from "@/server/sales/service";
import type { SaleDoc } from "@/server/types";
import { actor, key, makeProduct } from "../support/fixtures";

const TODAY = "2026-10-23"; // cutoff = 2026-04-01

async function snapshotState() {
  const [products, stats, customers, suppliers, movements, summaries] = await Promise.all([
    col(COL.products).get(),
    col(COL.stats).get(),
    col(COL.customers).get(),
    col(COL.suppliers).get(),
    col(COL.stockMovements).get(),
    col(COL.dailySummaries).get(),
  ]);
  const dump = (s: FirebaseFirestore.QuerySnapshot) =>
    Object.fromEntries(s.docs.map((d) => [d.id, d.data()]).sort(([a], [b]) => String(a).localeCompare(String(b))));
  return {
    products: dump(products),
    stats: dump(stats),
    customers: dump(customers),
    suppliers: dump(suppliers),
    movementCount: movements.size,
    summaries: dump(summaries),
  };
}

async function setup() {
  const productId = await makeProduct({ qty: 100_000, unitCost: 1_000 });
  const customerId = (await createParty(actor, "customer", { name: "Old Customer", phone: "", email: "", address: "", notes: "", active: true })).id;
  const supplierId = (await createParty(actor, "supplier", { name: "Old Supplier", phone: "", email: "", address: "", notes: "", active: true })).id;
  const sale = (date: string, credit = false) =>
    createSale(actor, {
      action: "post",
      customerId: credit ? customerId : null,
      businessDate: date,
      items: [{ productId, qtyMilli: 1_000, unitPricePaise: 2_000, discountPaise: 0 }],
      billDiscountPaise: 0,
      notes: "",
      payment: credit ? null : { method: "cash", amountPaise: 2_000 },
      idempotencyKey: key(),
    });
  const oldSale = await sale("2026-01-15");
  const oldCredit = await sale("2026-03-31", true);
  const recent = await sale("2026-04-01");
  const draft = await createSale(actor, {
    action: "draft",
    customerId: null,
    businessDate: "2026-02-01",
    items: [{ productId, qtyMilli: 1_000, unitPricePaise: 2_000, discountPaise: 0 }],
    billDiscountPaise: 0,
    notes: "",
    payment: null,
    idempotencyKey: key(),
  });
  const oldPurchase = await createPurchase(actor, {
    action: "post",
    supplierId,
    supplierInvoiceNo: "",
    businessDate: "2026-02-10",
    items: [{ productId, qtyMilli: 5_000, unitPricePaise: 1_000, discountPaise: 0 }],
    billDiscountPaise: 0,
    notes: "",
    payment: null,
    idempotencyKey: key(),
  });
  return { productId, customerId, oldSale, oldCredit, recent, draft, oldPurchase };
}

describe("six-month archiving", () => {
  it("archives only eligible transactions and changes nothing else", async () => {
    const s = await setup();
    const before = await snapshotState();

    const batch = await createArchivePreview(actor, TODAY);
    expect(batch.cutoffDate).toBe("2026-04-01");
    expect(new Set(batch.saleIds)).toEqual(new Set([s.oldSale.id, s.oldCredit.id]));
    expect(batch.purchaseIds).toEqual([s.oldPurchase.id]);
    await expect(createArchivePreview(actor, TODAY)).rejects.toThrow(/open archive batch/);

    await generateArchive(actor, batch.id);
    await verifyArchive(actor, batch.id);
    await expect(commitArchive(actor, batch.id, "wrong-id")).rejects.toThrow(/exactly/);
    const { marked } = await commitArchive(actor, batch.id, batch.id);
    expect(marked).toBe(3);
    expect((await getBatch(batch.id)).status).toBe("committed");

    const after = await snapshotState();
    expect(after).toEqual(before);

    const sales = await listInvoices<SaleDoc>(COL.sales, {});
    expect(sales.map((x) => x.id).sort()).toEqual([s.recent.id, s.draft.id].sort());
    const all = await listInvoices<SaleDoc>(COL.sales, { includeArchived: true });
    expect(all).toHaveLength(4);
    const archived = (await col(COL.sales).doc(s.oldSale.id).get()).data() as SaleDoc;
    expect(archived).toMatchObject({ archived: true, archiveBatchId: batch.id, totals: { totalPaise: 2_000 } });

    const report = await buildReport("archived", { from: "2025-01-01", to: TODAY, includeArchived: false });
    expect(report.rows).toHaveLength(3);

    // Archived open invoices still collect payments.
    await recordPartyPayment(actor, {
      partyType: "customer",
      partyId: s.customerId,
      method: "cash",
      amountPaise: 2_000,
      businessDate: TODAY,
      invoiceId: null,
      notes: "",
      idempotencyKey: key(),
    });
    expect(((await col(COL.sales).doc(s.oldCredit.id).get()).data() as SaleDoc).duePaise).toBe(0);
  });

  it("refuses to archive when the records changed after the file was generated", async () => {
    const s = await setup();
    const batch = await createArchivePreview(actor, TODAY);
    await generateArchive(actor, batch.id);
    await col(COL.sales).doc(s.oldSale.id).update({ "totals.totalPaise": 9_999 });
    await expect(verifyArchive(actor, batch.id)).rejects.toThrow(/Archive check failed/);
    expect((await getBatch(batch.id)).status).toBe("failed");
    await expect(commitArchive(actor, batch.id, batch.id)).rejects.toThrow(/Only verified/);
    const archived = await col(COL.sales).where("archived", "==", true).get();
    expect(archived.size).toBe(0);
  });

  it("refuses to archive when the stored file was altered", async () => {
    await setup();
    const batch = await createArchivePreview(actor, TODAY);
    const generated = await generateArchive(actor, batch.id);
    await storageBucket().file(generated.filePath!).save(Buffer.from("not the archive"), { resumable: false });
    await expect(verifyArchive(actor, batch.id)).rejects.toThrow(/checksum/);
    expect((await col(COL.purchases).where("archived", "==", true).get()).size).toBe(0);
  });
});
