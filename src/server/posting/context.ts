import "server-only";
import { FieldValue, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import { DomainError } from "@/lib/errors";
import { monthKeyOf, type BusinessDate } from "@/lib/dates";
import type { Actor } from "../auth";
import { COL, col, nowIso } from "../collections";
import { db } from "../firebaseAdmin";
import { applyMovement, stockStatusOf, type MovementInput, type MovementOutcome } from "../inventory/costing";
import { readSettings } from "../settings";
import type {
  AuditLogDoc,
  PartyType,
  PaymentMethod,
  ProductDoc,
  ProductSalesEntry,
  ShopSettings,
  StockMovementDoc,
  StockMovementType,
} from "../types";

export interface SummaryDelta {
  salesCount?: number;
  salesPaise?: number;
  salesCogsPaise?: number;
  returnsPaise?: number;
  returnsCogsPaise?: number;
  purchasesCount?: number;
  purchasesPaise?: number;
  expensesPaise?: number;
  cashIn?: Partial<Record<PaymentMethod, number>>;
  cashOut?: Partial<Record<PaymentMethod, number>>;
  productSales?: Record<string, Partial<ProductSalesEntry>>;
}

export interface MovementContext {
  type: StockMovementType;
  refType: StockMovementDoc["refType"];
  refId: string;
  refNumber?: string;
  note?: string;
  businessDate: BusinessDate;
}

type ProductEntry = { ref: DocumentReference; data: ProductDoc; isNew: boolean; touched: boolean };

const SCALAR_SUMMARY_KEYS = [
  "salesCount",
  "salesPaise",
  "salesCogsPaise",
  "returnsPaise",
  "returnsCogsPaise",
  "purchasesCount",
  "purchasesPaise",
  "expensesPaise",
] as const;

function addInto(target: Record<string, number>, source: Record<string, number | undefined> | undefined) {
  if (!source) return;
  for (const [key, value] of Object.entries(source)) {
    if (value) target[key] = (target[key] ?? 0) + value;
  }
}

function mergeSummary(into: SummaryDelta, delta: SummaryDelta) {
  for (const key of SCALAR_SUMMARY_KEYS) {
    if (delta[key]) into[key] = (into[key] ?? 0) + (delta[key] ?? 0);
  }
  if (delta.cashIn) addInto((into.cashIn ??= {}), delta.cashIn);
  if (delta.cashOut) addInto((into.cashOut ??= {}), delta.cashOut);
  if (delta.productSales) {
    into.productSales ??= {};
    for (const [productId, entry] of Object.entries(delta.productSales)) {
      addInto((into.productSales[productId] ??= {}) as Record<string, number>, entry);
    }
  }
}

function incrementTree(values: Record<string, number>): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value) out[key] = FieldValue.increment(value);
  }
  return out;
}

/**
 * Collects every change made by one posting operation inside a Firestore transaction and writes
 * each affected document exactly once on `commit()`. All reads must happen before `commit()`.
 */
export class PostingContext {
  readonly now = nowIso();
  private products = new Map<string, ProductEntry>();
  private movements: StockMovementDoc[] = [];
  private summaries = new Map<BusinessDate, SummaryDelta>();
  private partyDeltas = new Map<string, { type: PartyType; id: string; delta: number }>();
  private counters = new Map<string, { ref: DocumentReference; value: number }>();
  private audits: AuditLogDoc[] = [];
  private inventoryValueDelta = 0;
  private productCountDelta = 0;

  private constructor(
    readonly tx: Transaction,
    readonly actor: Actor,
    readonly settings: ShopSettings,
  ) {}

  static async begin(tx: Transaction, actor: Actor): Promise<PostingContext> {
    return new PostingContext(tx, actor, await readSettings(tx));
  }

  async loadProducts(ids: string[]): Promise<void> {
    const missing = [...new Set(ids)].filter((id) => !this.products.has(id));
    if (missing.length === 0) return;
    const refs = missing.map((id) => col(COL.products).doc(id));
    const snaps = await this.tx.getAll(...refs);
    snaps.forEach((snap, i) => {
      if (!snap.exists) throw new DomainError("NOT_FOUND", `Product not found (${missing[i]}).`);
      this.products.set(snap.id, { ref: refs[i], data: snap.data() as ProductDoc, isNew: false, touched: false });
    });
  }

  addNewProduct(ref: DocumentReference, data: ProductDoc): void {
    this.products.set(ref.id, { ref, data, isNew: true, touched: true });
    this.productCountDelta += 1;
  }

  product(id: string): ProductDoc {
    const entry = this.products.get(id);
    if (!entry) throw new Error(`Product ${id} was not loaded in this transaction`);
    return entry.data;
  }

  /** Applies one stock movement through the costing engine and records it in the ledger. */
  move(productId: string, input: MovementInput, context: MovementContext): MovementOutcome {
    const entry = this.products.get(productId);
    if (!entry) throw new Error(`Product ${productId} was not loaded in this transaction`);
    const p = entry.data;
    let outcome: MovementOutcome;
    try {
      outcome = applyMovement(
        { qtyMilli: p.stockQtyMilli, valuePaise: p.stockValuePaise, lastCostPaise: p.purchaseCostPaise },
        input,
        { allowNegativeStock: this.settings.allowNegativeStock },
      );
    } catch (error) {
      if (error instanceof DomainError && error.code === "INSUFFICIENT_STOCK") {
        throw new DomainError("INSUFFICIENT_STOCK", `Not enough stock for ${p.name} (${p.sku}).`, {
          productId,
          available: p.stockQtyMilli,
          requested: input.qtyMilli,
        });
      }
      throw error;
    }
    p.stockQtyMilli = outcome.after.qtyMilli;
    p.stockValuePaise = outcome.after.valuePaise;
    p.stockStatus = stockStatusOf(p.stockQtyMilli, p.reorderLevelMilli);
    p.hasMovements = true;
    p.updatedAt = this.now;
    if (context.type === "SALE" && context.businessDate > (p.lastSoldDate ?? "")) p.lastSoldDate = context.businessDate;
    entry.touched = true;
    this.inventoryValueDelta += outcome.valueDeltaPaise;
    this.movements.push({
      productId,
      productName: p.name,
      sku: p.sku,
      type: context.type,
      qtyDeltaMilli: outcome.qtyDeltaMilli,
      valueDeltaPaise: outcome.valueDeltaPaise,
      balanceQtyAfter: p.stockQtyMilli,
      balanceValueAfter: p.stockValuePaise,
      refType: context.refType,
      refId: context.refId,
      refNumber: context.refNumber,
      note: context.note,
      businessDate: context.businessDate,
      createdAt: this.now,
      seq: this.movements.length,
      actorUid: this.actor.uid,
    });
    return outcome;
  }

  setLastCost(productId: string, unitCostPaise: number): void {
    const entry = this.products.get(productId);
    if (!entry) throw new Error(`Product ${productId} was not loaded in this transaction`);
    entry.data.purchaseCostPaise = unitCostPaise;
    entry.touched = true;
  }

  /** Reads and reserves the next number for a counter. Must be called during the read phase. */
  async reserveNumber(counter: string, prefix: string): Promise<string> {
    let entry = this.counters.get(counter);
    if (!entry) {
      const ref = col(COL.counters).doc(counter);
      const snap = await this.tx.get(ref);
      entry = { ref, value: (snap.data()?.value as number | undefined) ?? 0 };
      this.counters.set(counter, entry);
    }
    entry.value += 1;
    return `${prefix}-${String(entry.value).padStart(6, "0")}`;
  }

  summary(date: BusinessDate, delta: SummaryDelta): void {
    const existing = this.summaries.get(date) ?? {};
    mergeSummary(existing, delta);
    this.summaries.set(date, existing);
  }

  /** Positive delta increases the receivable (customer) or payable (supplier). */
  partyBalance(type: PartyType, id: string, delta: number): void {
    if (!delta) return;
    const key = `${type}:${id}`;
    const entry = this.partyDeltas.get(key) ?? { type, id, delta: 0 };
    entry.delta += delta;
    this.partyDeltas.set(key, entry);
  }

  audit(action: string, entityType: string, entityId: string, summary: string, data?: Record<string, unknown>): void {
    this.audits.push({
      action,
      entityType,
      entityId,
      summary,
      data,
      actorUid: this.actor.uid,
      actorEmail: this.actor.email,
      createdAt: this.now,
    });
  }

  commit(): void {
    const { tx } = this;
    for (const entry of this.products.values()) {
      if (entry.isNew) {
        tx.set(entry.ref, entry.data);
      } else if (entry.touched) {
        const p = entry.data;
        tx.update(entry.ref, {
          stockQtyMilli: p.stockQtyMilli,
          stockValuePaise: p.stockValuePaise,
          stockStatus: p.stockStatus,
          purchaseCostPaise: p.purchaseCostPaise,
          hasMovements: p.hasMovements,
          lastSoldDate: p.lastSoldDate ?? "",
          updatedAt: this.now,
        });
      }
    }
    for (const movement of this.movements) {
      tx.set(col(COL.stockMovements).doc(), movement);
    }
    if (this.inventoryValueDelta || this.productCountDelta) {
      tx.set(
        col(COL.stats).doc("inventory"),
        incrementTree({ valuePaise: this.inventoryValueDelta, productCount: this.productCountDelta }),
        { merge: true },
      );
    }
    for (const { ref, value } of this.counters.values()) {
      tx.set(ref, { value, updatedAt: this.now });
    }
    for (const [date, delta] of this.summaries) {
      const scalars: Record<string, number> = {};
      for (const key of SCALAR_SUMMARY_KEYS) if (delta[key]) scalars[key] = delta[key]!;
      const doc: Record<string, unknown> = { date, monthKey: monthKeyOf(date), ...incrementTree(scalars) };
      if (delta.cashIn) doc.cashIn = incrementTree(delta.cashIn as Record<string, number>);
      if (delta.cashOut) doc.cashOut = incrementTree(delta.cashOut as Record<string, number>);
      if (delta.productSales) {
        doc.productSales = Object.fromEntries(
          Object.entries(delta.productSales).map(([id, entry]) => [id, incrementTree(entry as Record<string, number>)]),
        );
      }
      tx.set(col(COL.dailySummaries).doc(date), doc, { merge: true });
    }
    let receivable = 0;
    let payable = 0;
    for (const { type, id, delta } of this.partyDeltas.values()) {
      const ref = col(type === "customer" ? COL.customers : COL.suppliers).doc(id);
      tx.update(ref, { balancePaise: FieldValue.increment(delta), updatedAt: this.now });
      if (type === "customer") receivable += delta;
      else payable += delta;
    }
    if (receivable || payable) {
      tx.set(
        col(COL.stats).doc("balances"),
        incrementTree({ receivablePaise: receivable, payablePaise: payable }),
        { merge: true },
      );
    }
    for (const audit of this.audits) {
      tx.set(col(COL.auditLogs).doc(), audit);
    }
  }
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,100}$/;

/**
 * Runs a posting operation in one Firestore transaction. When `idempotencyKey` was already used
 * for the same scope, the stored result is returned and nothing is written again.
 */
export async function runPosting<T>(
  actor: Actor,
  idempotencyKey: string | undefined,
  scope: string,
  body: (ctx: PostingContext) => Promise<T>,
): Promise<T> {
  if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new DomainError("VALIDATION", "Invalid idempotency key.");
  }
  return db().runTransaction(
    async (tx) => {
      const keyRef = idempotencyKey ? col(COL.idempotencyKeys).doc(idempotencyKey) : null;
      if (keyRef) {
        const prior = await tx.get(keyRef);
        if (prior.exists) {
          const data = prior.data() as { scope: string; result: T };
          if (data.scope !== scope) {
            throw new DomainError("CONFLICT", "This request key was already used for a different operation.");
          }
          return data.result;
        }
      }
      const ctx = await PostingContext.begin(tx, actor);
      const result = await body(ctx);
      ctx.commit();
      if (keyRef) {
        tx.set(keyRef, { scope, result, actorUid: actor.uid, createdAt: ctx.now });
      }
      return result;
    },
    { maxAttempts: 10 },
  );
}
