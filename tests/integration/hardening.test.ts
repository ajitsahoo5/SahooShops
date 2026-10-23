import { deleteApp, initializeApp } from "firebase/app";
import { connectFirestoreEmulator, doc, getDoc, getFirestore, setDoc, terminate } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { verifySession } from "@/server/auth";
import { COL, col } from "@/server/collections";
import { adminAuth } from "@/server/firebaseAdmin";
import { checkIntegrity } from "@/server/inventory/integrity";
import { createParty } from "@/server/parties/service";
import { recordPartyPayment } from "@/server/payments/service";
import { runPosting } from "@/server/posting/context";
import { adjustStock } from "@/server/products/service";
import { createPurchase } from "@/server/purchases/service";
import { createSaleReturn } from "@/server/sales/returns";
import { createSale, reverseSale } from "@/server/sales/service";
import type { PartyDoc, SaleDoc } from "@/server/types";
import { actor, docData, key, makeProduct, product, TODAY } from "../support/fixtures";

const projectId = process.env.FIREBASE_PROJECT_ID!;

describe("security", () => {
  it("denies all direct client access to Firestore", async () => {
    const app = initializeApp({ projectId, apiKey: "demo-key" }, `rules-${Date.now()}`);
    const firestore = getFirestore(app);
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
    connectFirestoreEmulator(firestore, host, Number(port));
    try {
      await expect(getDoc(doc(firestore, "products", "anything"))).rejects.toMatchObject({ code: "permission-denied" });
      await expect(setDoc(doc(firestore, "sales", "forged"), { totalPaise: 1 })).rejects.toMatchObject({
        code: "permission-denied",
      });
    } finally {
      await terminate(firestore);
      await deleteApp(app);
    }
  });

  it("accepts session cookies only for users with the admin claim", async () => {
    const auth = adminAuth();
    const email = `user-${Date.now()}@test.local`;
    const user = await auth.createUser({ email, password: "a-long-password" });
    const signIn = async () => {
      const res = await fetch(
        `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "a-long-password", returnSecureToken: true }) },
      );
      return ((await res.json()) as { idToken: string }).idToken;
    };
    const plainCookie = await auth.createSessionCookie(await signIn(), { expiresIn: 3_600_000 });
    expect(await verifySession(plainCookie)).toBeNull();

    await auth.setCustomUserClaims(user.uid, { admin: true });
    const adminCookie = await auth.createSessionCookie(await signIn(), { expiresIn: 3_600_000 });
    expect(await verifySession(adminCookie)).toMatchObject({ uid: user.uid, email });

    // Revocation is compared at one-second resolution against the sign-in time.
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    await auth.revokeRefreshTokens(user.uid);
    expect(await verifySession(adminCookie)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    await auth.deleteUser(user.uid);
  });
});

describe("failure handling", () => {
  it("rolls back every write when a posting fails midway, and the key stays reusable", async () => {
    const productId = await makeProduct({ qty: 5_000, unitCost: 1_000 });
    const idempotencyKey = key();
    await expect(
      runPosting(actor, idempotencyKey, "test.fail", async (ctx) => {
        await ctx.loadProducts([productId]);
        ctx.move(productId, { kind: "outAverage", qtyMilli: 1_000 }, { type: "ADJUSTMENT", refType: "adjustment", refId: "x", businessDate: TODAY });
        ctx.summary(TODAY, { salesPaise: 999 });
        throw new Error("simulated crash");
      }),
    ).rejects.toThrow("simulated crash");
    expect(await product(productId)).toMatchObject({ stockQtyMilli: 5_000, stockValuePaise: 5_000 });
    expect((await col(COL.idempotencyKeys).doc(idempotencyKey).get()).exists).toBe(false);
    expect((await col(COL.dailySummaries).doc(TODAY).get()).exists).toBe(false);

    await adjustStock(actor, {
      productId,
      direction: "out",
      qtyMilli: 1_000,
      unitCostPaise: null,
      reason: "Retry after failure",
      businessDate: TODAY,
      idempotencyKey,
    });
    expect((await product(productId)).stockQtyMilli).toBe(4_000);
  });

  it("rejects a key reused for a different operation", async () => {
    const productId = await makeProduct({ qty: 5_000 });
    const idempotencyKey = key();
    await adjustStock(actor, { productId, direction: "out", qtyMilli: 1_000, unitCostPaise: null, reason: "Damaged", businessDate: TODAY, idempotencyKey });
    await expect(
      createSale(actor, {
        action: "post",
        customerId: null,
        businessDate: TODAY,
        items: [{ productId, qtyMilli: 1_000, unitPricePaise: 100, discountPaise: 0 }],
        billDiscountPaise: 0,
        notes: "",
        payment: { method: "cash", amountPaise: 100 },
        idempotencyKey,
      }),
    ).rejects.toThrow(/different operation/);
  });
});

describe("concurrency", () => {
  it("lets only one of two competing full payments succeed", async () => {
    const productId = await makeProduct({ qty: 10_000 });
    const customerId = (await createParty(actor, "customer", { name: "Race", phone: "", email: "", address: "", notes: "", active: true })).id;
    await createSale(actor, {
      action: "post",
      customerId,
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 1_000, unitPricePaise: 5_000, discountPaise: 0 }],
      billDiscountPaise: 0,
      notes: "",
      payment: null,
      idempotencyKey: key(),
    });
    const pay = () =>
      recordPartyPayment(actor, {
        partyType: "customer",
        partyId: customerId,
        method: "cash",
        amountPaise: 5_000,
        businessDate: TODAY,
        invoiceId: null,
        notes: "",
        idempotencyKey: key(),
      });
    const results = await Promise.allSettled([pay(), pay(), pay()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await docData<PartyDoc>(COL.customers, customerId)).balancePaise).toBe(0);
  });

  it("serializes a return racing a reversal on the same sale", async () => {
    const productId = await makeProduct({ qty: 10_000, unitCost: 1_000 });
    const sale = await createSale(actor, {
      action: "post",
      customerId: null,
      businessDate: TODAY,
      items: [{ productId, qtyMilli: 2_000, unitPricePaise: 2_000, discountPaise: 0 }],
      billDiscountPaise: 0,
      notes: "",
      payment: { method: "cash", amountPaise: 4_000 },
      idempotencyKey: key(),
    });
    const results = await Promise.allSettled([
      createSaleReturn(actor, sale.id, { businessDate: TODAY, items: [{ lineIndex: 0, qtyMilli: 1_000 }], refundMethod: "cash", reason: "Return", idempotencyKey: key() }),
      reverseSale(actor, sale.id, { reason: "Reverse", refundMethod: "cash", idempotencyKey: key() }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const s = await docData<SaleDoc>(COL.sales, sale.id);
    const p = await product(productId);
    if (s.status === "reversed") expect(p.stockQtyMilli).toBe(10_000);
    else expect(p.stockQtyMilli).toBe(9_000);
    expect((await checkIntegrity()).issues).toEqual([]);
  });

  it("keeps every running total consistent after a burst of mixed operations", async () => {
    const products = await Promise.all([1, 2, 3].map((i) => makeProduct({ qty: 20_000, unitCost: 700 + i * 13 })));
    const supplierId = (await createParty(actor, "supplier", { name: "S", phone: "", email: "", address: "", notes: "", active: true })).id;
    const customerId = (await createParty(actor, "customer", { name: "C", phone: "", email: "", address: "", notes: "", active: true })).id;
    const ops: Promise<unknown>[] = [];
    for (let i = 0; i < 24; i++) {
      const productId = products[i % 3];
      if (i % 4 === 0) {
        ops.push(
          createPurchase(actor, {
            action: "post",
            supplierId,
            supplierInvoiceNo: "",
            businessDate: TODAY,
            items: [{ productId, qtyMilli: 3_333, unitPricePaise: 911, discountPaise: 7 }],
            billDiscountPaise: 3,
            notes: "",
            payment: { method: "bank", amountPaise: 1_000 },
            idempotencyKey: key(),
          }),
        );
      } else {
        ops.push(
          createSale(actor, {
            action: "post",
            customerId: i % 3 === 0 ? customerId : null,
            businessDate: TODAY,
            items: [{ productId, qtyMilli: 1_250, unitPricePaise: 1_499, discountPaise: 0 }],
            billDiscountPaise: 0,
            notes: "",
            payment: i % 3 === 0 ? { method: "upi", amountPaise: 500 } : { method: "cash", amountPaise: 1_874 },
            idempotencyKey: key(),
          }),
        );
      }
    }
    await Promise.allSettled(ops);
    const result = await checkIntegrity();
    expect(result.issues).toEqual([]);
    expect(result.productsChecked).toBe(3);
  });
});
