import "server-only";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin";
import type { WithId } from "./types";

export const COL = {
  settings: "settings",
  counters: "counters",
  categories: "categories",
  products: "products",
  skuIndex: "skuIndex",
  stockMovements: "stockMovements",
  customers: "customers",
  suppliers: "suppliers",
  purchases: "purchases",
  sales: "sales",
  salesReturns: "salesReturns",
  payments: "payments",
  expenses: "expenses",
  expenseCategories: "expenseCategories",
  idempotencyKeys: "idempotencyKeys",
  auditLogs: "auditLogs",
  dailySummaries: "dailySummaries",
  stats: "stats",
  archiveBatches: "archiveBatches",
} as const;

export function col(name: (typeof COL)[keyof typeof COL]) {
  return db().collection(name);
}

export function withId<T>(snap: DocumentSnapshot): WithId<T> {
  return { id: snap.id, ...(snap.data() as T) };
}

export function nowIso(): string {
  return new Date().toISOString();
}
