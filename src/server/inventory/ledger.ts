import "server-only";
import type { Query } from "firebase-admin/firestore";
import { COL, col, withId } from "../collections";
import type { StockMovementDoc, StockMovementType, WithId } from "../types";

export interface MovementFilters {
  productId?: string;
  type?: StockMovementType;
  from?: string;
  to?: string;
  limit?: number;
}

export async function listMovements(filters: MovementFilters): Promise<WithId<StockMovementDoc>[]> {
  let query: Query = col(COL.stockMovements);
  if (filters.productId) query = query.where("productId", "==", filters.productId);
  if (filters.type) query = query.where("type", "==", filters.type);
  if (filters.from) query = query.where("businessDate", ">=", filters.from);
  if (filters.to) query = query.where("businessDate", "<=", filters.to);
  query = query.orderBy("businessDate", "desc").orderBy("createdAt", "desc");
  const snap = await query.limit(filters.limit ?? 300).get();
  return snap.docs.map((d) => withId<StockMovementDoc>(d));
}

/** Recomputes a product's balance from its ledger. Used by integrity checks and tests. */
export async function ledgerTotals(productId: string): Promise<{ qtyMilli: number; valuePaise: number; count: number }> {
  const snap = await col(COL.stockMovements).where("productId", "==", productId).get();
  let qtyMilli = 0;
  let valuePaise = 0;
  for (const doc of snap.docs) {
    const m = doc.data() as StockMovementDoc;
    qtyMilli += m.qtyDeltaMilli;
    valuePaise += m.valueDeltaPaise;
  }
  return { qtyMilli, valuePaise, count: snap.size };
}
