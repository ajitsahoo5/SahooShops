import { randomUUID } from "node:crypto";
import type { Actor } from "@/server/auth";
import { createProduct } from "@/server/products/service";
import { COL, col } from "@/server/collections";
import type { ProductDoc } from "@/server/types";

export const actor: Actor = { uid: "test-admin", email: "admin@test.local" };

export const key = () => randomUUID();

export const TODAY = "2026-10-23";

export async function makeProduct(
  overrides: Partial<{ sku: string; name: string; qty: number; unitCost: number; price: number; reorder: number }> = {},
): Promise<string> {
  const sku = overrides.sku ?? `SKU-${randomUUID().slice(0, 8)}`;
  const { id } = await createProduct(actor, {
    sku: sku.toUpperCase(),
    name: overrides.name ?? `Product ${sku}`,
    categoryId: null,
    unit: "pcs",
    purchaseCostPaise: overrides.unitCost ?? 1000,
    sellingPricePaise: overrides.price ?? 1500,
    reorderLevelMilli: overrides.reorder ?? 0,
    active: true,
    openingStock:
      overrides.qty === undefined || overrides.qty === 0
        ? null
        : { qtyMilli: overrides.qty, unitCostPaise: overrides.unitCost ?? 1000, businessDate: TODAY },
    idempotencyKey: key(),
  });
  return id;
}

export async function product(id: string): Promise<ProductDoc> {
  return (await col(COL.products).doc(id).get()).data() as ProductDoc;
}

export async function docData<T>(collection: (typeof COL)[keyof typeof COL], id: string): Promise<T> {
  return (await col(collection).doc(id).get()).data() as T;
}
