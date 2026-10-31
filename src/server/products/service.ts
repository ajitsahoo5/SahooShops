import "server-only";
import { FieldValue, type Query } from "firebase-admin/firestore";
import { DomainError } from "@/lib/errors";
import { lineAmount } from "@/lib/qty";
import type {
  CreateProductInput,
  ProductListQuery,
  StockAdjustmentInput,
  UpdateProductInput,
} from "@/lib/schemas/product";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col, nowIso, withId } from "../collections";
import { db } from "../firebaseAdmin";
import { averageUnitCost, stockStatusOf } from "../inventory/costing";
import { runPosting } from "../posting/context";
import type { ProductDoc, StockMovementDoc, WithId } from "../types";
import { buildSearchTokens, queryTokens } from "./search";

const LIST_LIMIT = 500;

function skuRef(sku: string) {
  return col(COL.skuIndex).doc(sku.toUpperCase());
}

export async function createProduct(actor: Actor, input: CreateProductInput): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "product.create", async (ctx) => {
    const { tx } = ctx;
    const [skuSnap, categorySnap] = await Promise.all([
      tx.get(skuRef(input.sku)),
      input.categoryId ? tx.get(col(COL.categories).doc(input.categoryId)) : Promise.resolve(null),
    ]);
    if (skuSnap.exists) throw new DomainError("CONFLICT", `SKU ${input.sku} is already used by another product.`);
    if (categorySnap && !categorySnap.exists) throw new DomainError("NOT_FOUND", "Category not found.");

    const ref = col(COL.products).doc();
    const data: ProductDoc = {
      sku: input.sku,
      skuKey: input.sku.toUpperCase(),
      name: input.name,
      nameLower: input.name.toLowerCase(),
      categoryId: input.categoryId,
      unit: input.unit,
      purchaseCostPaise: input.openingStock?.unitCostPaise || input.purchaseCostPaise,
      sellingPricePaise: input.sellingPricePaise,
      reorderLevelMilli: input.reorderLevelMilli,
      stockQtyMilli: 0,
      stockValuePaise: 0,
      stockStatus: stockStatusOf(0, input.reorderLevelMilli),
      active: input.active,
      searchTokens: buildSearchTokens(input.name, input.sku),
      hasMovements: false,
      lastSoldDate: "",
      createdAt: ctx.now,
      updatedAt: ctx.now,
    };
    ctx.addNewProduct(ref, data);
    tx.set(skuRef(input.sku), { productId: ref.id });

    if (input.openingStock) {
      const { qtyMilli, unitCostPaise, businessDate } = input.openingStock;
      ctx.move(
        ref.id,
        { kind: "in", qtyMilli, valuePaise: lineAmount(qtyMilli, unitCostPaise) },
        { type: "OPENING", refType: "product", refId: ref.id, businessDate, note: "Opening stock" },
      );
    }
    ctx.audit("product.create", "product", ref.id, `Created product ${input.sku} ${input.name}`, {
      openingQtyMilli: input.openingStock?.qtyMilli ?? 0,
    });
    return { id: ref.id };
  });
}

export async function updateProduct(actor: Actor, id: string, input: UpdateProductInput): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.products).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Product not found.");
    const current = snap.data() as ProductDoc;
    const skuChanged = current.skuKey !== input.sku.toUpperCase();
    const [newSkuSnap, categorySnap] = await Promise.all([
      skuChanged ? tx.get(skuRef(input.sku)) : Promise.resolve(null),
      input.categoryId ? tx.get(col(COL.categories).doc(input.categoryId)) : Promise.resolve(null),
    ]);
    if (newSkuSnap?.exists) throw new DomainError("CONFLICT", `SKU ${input.sku} is already used by another product.`);
    if (categorySnap && !categorySnap.exists) throw new DomainError("NOT_FOUND", "Category not found.");

    const changes: Partial<ProductDoc> = {
      sku: input.sku,
      skuKey: input.sku.toUpperCase(),
      name: input.name,
      nameLower: input.name.toLowerCase(),
      categoryId: input.categoryId,
      unit: input.unit,
      purchaseCostPaise: input.purchaseCostPaise,
      sellingPricePaise: input.sellingPricePaise,
      reorderLevelMilli: input.reorderLevelMilli,
      stockStatus: stockStatusOf(current.stockQtyMilli, input.reorderLevelMilli),
      active: input.active,
      searchTokens: buildSearchTokens(input.name, input.sku),
      updatedAt: nowIso(),
    };
    tx.update(ref, changes);
    if (skuChanged) {
      tx.delete(skuRef(current.sku));
      tx.set(skuRef(input.sku), { productId: id });
    }
    const changed = (Object.keys(changes) as (keyof ProductDoc)[]).filter(
      (k) => k !== "updatedAt" && k !== "searchTokens" && JSON.stringify(current[k]) !== JSON.stringify(changes[k]),
    );
    writeAudit(tx, actor, "product.update", "product", id, `Updated ${input.sku}: ${changed.join(", ") || "no changes"}`, {
      before: Object.fromEntries(changed.map((k) => [k, current[k]])),
      after: Object.fromEntries(changed.map((k) => [k, changes[k]])),
    });
  });
}

export async function setOpeningStock(
  actor: Actor,
  id: string,
  input: { qtyMilli: number; unitCostPaise: number; businessDate: string; idempotencyKey: string },
): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "product.opening", async (ctx) => {
    await ctx.loadProducts([id]);
    const product = ctx.product(id);
    if (product.hasMovements) {
      throw new DomainError("INVALID_STATE", "This product already has stock history. Use a stock adjustment instead.");
    }
    ctx.move(
      id,
      { kind: "in", qtyMilli: input.qtyMilli, valuePaise: lineAmount(input.qtyMilli, input.unitCostPaise) },
      { type: "OPENING", refType: "product", refId: id, businessDate: input.businessDate, note: "Opening stock" },
    );
    if (input.unitCostPaise > 0) ctx.setLastCost(id, input.unitCostPaise);
    ctx.audit("product.opening", "product", id, `Opening stock for ${product.sku}`, { qtyMilli: input.qtyMilli });
    return { id };
  });
}

export async function deleteProduct(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.products).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Product not found.");
    const product = snap.data() as ProductDoc;
    if (product.hasMovements) {
      throw new DomainError("INVALID_STATE", "Products with stock history cannot be deleted. Mark it inactive instead.");
    }
    tx.delete(ref);
    tx.delete(skuRef(product.sku));
    tx.set(col(COL.stats).doc("inventory"), { productCount: FieldValue.increment(-1) }, { merge: true });
    writeAudit(tx, actor, "product.delete", "product", id, `Deleted unused product ${product.sku}`);
  });
}

export async function adjustStock(actor: Actor, input: StockAdjustmentInput): Promise<{ adjustmentId: string }> {
  return runPosting(actor, input.idempotencyKey, "stock.adjust", async (ctx) => {
    await ctx.loadProducts([input.productId]);
    const product = ctx.product(input.productId);
    const adjustmentId = col(COL.stockMovements).doc().id;
    const context = {
      type: "ADJUSTMENT" as const,
      refType: "adjustment" as const,
      refId: adjustmentId,
      businessDate: input.businessDate,
      note: input.reason,
    };
    if (input.direction === "in") {
      const unitCost =
        input.unitCostPaise ??
        averageUnitCost({
          qtyMilli: product.stockQtyMilli,
          valuePaise: product.stockValuePaise,
          lastCostPaise: product.purchaseCostPaise,
        });
      ctx.move(input.productId, { kind: "in", qtyMilli: input.qtyMilli, valuePaise: lineAmount(input.qtyMilli, unitCost) }, context);
    } else {
      ctx.move(input.productId, { kind: "outAverage", qtyMilli: input.qtyMilli }, context);
    }
    ctx.audit("stock.adjust", "product", input.productId, `Stock ${input.direction} for ${product.sku}: ${input.reason}`, {
      qtyMilli: input.qtyMilli,
      direction: input.direction,
    });
    return { adjustmentId };
  });
}

export async function getProduct(id: string): Promise<WithId<ProductDoc> | null> {
  const snap = await col(COL.products).doc(id).get();
  return snap.exists ? withId<ProductDoc>(snap) : null;
}

function productSortField(sort: ProductListQuery["sort"] | undefined): "nameLower" | "sku" {
  return sort === "sku" ? "sku" : "nameLower";
}

export async function listProducts(filters: Partial<ProductListQuery>): Promise<{ items: WithId<ProductDoc>[]; truncated: boolean }> {
  const tokens = filters.q ? queryTokens(filters.q) : [];
  const sortField = productSortField(filters.sort);
  const direction = filters.dir === "desc" ? "desc" : "asc";
  let query: Query = col(COL.products);
  if (tokens.length) query = query.where("searchTokens", "array-contains", tokens[0]);
  if (filters.categoryId) query = query.where("categoryId", "==", filters.categoryId);
  if (filters.status) query = query.where("stockStatus", "==", filters.status);
  if (filters.active === "active" || filters.active === undefined) query = query.where("active", "==", true);
  if (filters.active === "inactive") query = query.where("active", "==", false);
  // Token search cannot order in Firestore without a composite index per filter combination.
  // Those results are sorted in memory after the token filter.
  if (!tokens.length) query = query.orderBy(sortField, direction);
  const snap = await query.limit(LIST_LIMIT).get();
  let items = snap.docs.map((d) => withId<ProductDoc>(d));
  if (tokens.length > 1) {
    items = items.filter((p) => tokens.every((t) => p.searchTokens.includes(t)));
  }
  if (tokens.length) {
    items.sort((a, b) => {
      const cmp = a[sortField].localeCompare(b[sortField]);
      return direction === "desc" ? -cmp : cmp;
    });
  }
  return { items, truncated: snap.size >= LIST_LIMIT };
}

/** Lightweight active-product search for invoice line pickers. */
export async function searchProducts(q: string, limit = 20): Promise<WithId<ProductDoc>[]> {
  const { items } = await listProducts({ q, active: "active" });
  return items.slice(0, limit);
}

export async function listProductMovements(productId: string, limit = 200): Promise<WithId<StockMovementDoc>[]> {
  const snap = await col(COL.stockMovements)
    .where("productId", "==", productId)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();
  return snap.docs
    .map((d) => withId<StockMovementDoc>(d))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.seq - a.seq);
}
