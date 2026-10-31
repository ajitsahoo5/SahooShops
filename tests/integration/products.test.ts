import { describe, expect, it } from "vitest";
import { COL, col } from "@/server/collections";
import { ledgerTotals } from "@/server/inventory/ledger";
import { adjustStock, createProduct, listProducts, setOpeningStock, updateProduct } from "@/server/products/service";
import type { InventoryStatsDoc } from "@/server/types";
import { actor, docData, key, makeProduct, product, TODAY } from "../support/fixtures";

describe("products", () => {
  it("creates a product with opening stock through the ledger", async () => {
    const id = await makeProduct({ sku: "RICE-5KG", name: "Basmati Rice 5kg", qty: 12_000, unitCost: 45_000 });
    const p = await product(id);
    expect(p).toMatchObject({ stockQtyMilli: 12_000, stockValuePaise: 540_000, stockStatus: "ok", hasMovements: true });
    expect(await ledgerTotals(id)).toMatchObject({ qtyMilli: 12_000, valuePaise: 540_000, count: 1 });
    const stats = await docData<InventoryStatsDoc>(COL.stats, "inventory");
    expect(stats).toMatchObject({ valuePaise: 540_000, productCount: 1 });
  });

  it("enforces unique SKUs case-insensitively", async () => {
    await makeProduct({ sku: "SOAP-1" });
    await expect(makeProduct({ sku: "soap-1" })).rejects.toThrow(/already used/);
  });

  it("is idempotent for retried create requests", async () => {
    const input = {
      sku: "OIL-1L",
      name: "Sunflower Oil 1L",
      categoryId: null,
      unit: "pcs",
      purchaseCostPaise: 12_000,
      sellingPricePaise: 14_000,
      reorderLevelMilli: 5_000,
      active: true,
      openingStock: { qtyMilli: 10_000, unitCostPaise: 12_000, businessDate: TODAY },
      idempotencyKey: key(),
    };
    const first = await createProduct(actor, input);
    const second = await createProduct(actor, input);
    expect(second.id).toBe(first.id);
    const all = await col(COL.products).get();
    expect(all.size).toBe(1);
    expect((await product(first.id)).stockQtyMilli).toBe(10_000);
  });

  it("only allows opening stock before any stock history", async () => {
    const id = await makeProduct({ qty: 0 });
    await setOpeningStock(actor, id, { qtyMilli: 5_000, unitCostPaise: 2_000, businessDate: TODAY, idempotencyKey: key() });
    expect((await product(id)).stockValuePaise).toBe(10_000);
    await expect(
      setOpeningStock(actor, id, { qtyMilli: 5_000, unitCostPaise: 2_000, businessDate: TODAY, idempotencyKey: key() }),
    ).rejects.toThrow(/already has stock history/);
  });

  it("adjusts stock out at average cost and blocks negative stock", async () => {
    const id = await makeProduct({ qty: 3_000, unitCost: 1_000 });
    await adjustStock(actor, {
      productId: id,
      direction: "out",
      qtyMilli: 1_000,
      unitCostPaise: null,
      reason: "Damaged",
      businessDate: TODAY,
      idempotencyKey: key(),
    });
    expect(await product(id)).toMatchObject({ stockQtyMilli: 2_000, stockValuePaise: 2_000 });
    await expect(
      adjustStock(actor, {
        productId: id,
        direction: "out",
        qtyMilli: 5_000,
        unitCostPaise: null,
        reason: "Counting error",
        businessDate: TODAY,
        idempotencyKey: key(),
      }),
    ).rejects.toThrow(/Not enough stock/);
    expect(await ledgerTotals(id)).toMatchObject({ qtyMilli: 2_000, valuePaise: 2_000 });
  });

  it("updates low-stock status when the reorder level changes", async () => {
    const id = await makeProduct({ sku: "TEA-250", qty: 4_000 });
    const p = await product(id);
    await updateProduct(actor, id, {
      sku: "TEA-250G",
      name: p.name,
      categoryId: null,
      unit: p.unit,
      purchaseCostPaise: p.purchaseCostPaise,
      sellingPricePaise: p.sellingPricePaise,
      reorderLevelMilli: 5_000,
      active: true,
    });
    expect(await product(id)).toMatchObject({ sku: "TEA-250G", stockStatus: "low" });
    expect((await col(COL.skuIndex).doc("TEA-250").get()).exists).toBe(false);
    expect((await col(COL.skuIndex).doc("TEA-250G").get()).exists).toBe(true);
  });

  it("searches by name and SKU prefixes", async () => {
    await makeProduct({ sku: "DAL-1", name: "Toor Dal 1kg" });
    await makeProduct({ sku: "DAL-2", name: "Moong Dal 500g" });
    await makeProduct({ sku: "SUG-1", name: "Sugar 1kg" });
    expect((await listProducts({ q: "dal" })).items).toHaveLength(2);
    expect((await listProducts({ q: "moo dal" })).items.map((p) => p.name)).toEqual(["Moong Dal 500g"]);
    expect((await listProducts({ q: "sug" })).items).toHaveLength(1);
    expect((await listProducts({ sort: "sku", dir: "asc" })).items.map((p) => p.sku)).toEqual(["DAL-1", "DAL-2", "SUG-1"]);
    expect((await listProducts({ sort: "sku", dir: "desc" })).items.map((p) => p.sku)).toEqual(["SUG-1", "DAL-2", "DAL-1"]);
    expect((await listProducts({ sort: "name", dir: "desc" })).items.map((p) => p.name)).toEqual([
      "Toor Dal 1kg",
      "Sugar 1kg",
      "Moong Dal 500g",
    ]);
    expect((await listProducts({ q: "dal", sort: "sku", dir: "desc" })).items.map((p) => p.sku)).toEqual(["DAL-2", "DAL-1"]);
  });
});
