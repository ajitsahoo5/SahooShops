// Generates firestore.indexes.json from the queries used in src/server. Run: node scripts/generate-indexes.mjs
import { writeFileSync } from "node:fs";

const A = (fieldPath) => ({ fieldPath, order: "ASCENDING" });
const D = (fieldPath) => ({ fieldPath, order: "DESCENDING" });
const C = (fieldPath) => ({ fieldPath, arrayConfig: "CONTAINS" });
const ix = (collectionGroup, ...fields) => ({ collectionGroup, queryScope: "COLLECTION", fields });

const indexes = [];

// Products: list filters (category, stock status, active) with name ordering, and token search.
for (const cat of [false, true]) {
  for (const status of [false, true]) {
    for (const active of [false, true]) {
      const eq = [cat && A("categoryId"), status && A("stockStatus"), active && A("active")].filter(Boolean);
      if (eq.length) indexes.push(ix("products", ...eq, A("nameLower")));
      if (eq.length) indexes.push(ix("products", C("searchTokens"), ...eq));
    }
  }
}
indexes.push(ix("products", A("active"), A("stockStatus")));
indexes.push(ix("products", A("active"), A("stockStatus"), A("lastSoldDate")));

// Stock ledger.
indexes.push(ix("stockMovements", A("productId"), D("createdAt")));
indexes.push(ix("stockMovements", D("businessDate"), D("createdAt")));
indexes.push(ix("stockMovements", A("productId"), D("businessDate"), D("createdAt")));
indexes.push(ix("stockMovements", A("type"), D("businessDate"), D("createdAt")));
indexes.push(ix("stockMovements", A("productId"), A("type"), D("businessDate"), D("createdAt")));

// Sales and purchases lists, FIFO allocation, archive eligibility.
for (const [group, party] of [["sales", "customerId"], ["purchases", "supplierId"]]) {
  for (const archived of [false, true]) {
    for (const status of [false, true]) {
      for (const p of [false, true]) {
        const eq = [archived && A("archived"), status && A("status"), p && A(party)].filter(Boolean);
        if (eq.length) indexes.push(ix(group, ...eq, D("businessDate")));
      }
    }
  }
  indexes.push(ix(group, A(party), A("isOpen"), A("businessDate")));
  indexes.push(ix(group, A("archived"), A("businessDate")));
}

// Payments and expenses.
indexes.push(ix("payments", A("method"), D("businessDate")));
indexes.push(ix("payments", A("kind"), D("businessDate")));
indexes.push(ix("payments", A("method"), A("kind"), D("businessDate")));
indexes.push(ix("payments", A("partyId"), D("createdAt")));
indexes.push(ix("expenses", A("categoryId"), D("businessDate")));

// Parties.
indexes.push(ix("customers", A("active"), A("nameLower")));
indexes.push(ix("suppliers", A("active"), A("nameLower")));

const noIndex = (collectionGroup, fieldPath) => ({ collectionGroup, fieldPath, indexes: [] });
const fieldOverrides = [
  noIndex("sales", "items"),
  noIndex("purchases", "items"),
  noIndex("salesReturns", "items"),
  noIndex("dailySummaries", "productSales"),
  noIndex("archiveBatches", "saleIds"),
  noIndex("archiveBatches", "purchaseIds"),
  noIndex("auditLogs", "data"),
  noIndex("idempotencyKeys", "result"),
  // Search tokens only need array-contains, not ascending or descending single-field indexes.
  { collectionGroup: "products", fieldPath: "searchTokens", indexes: [{ arrayConfig: "CONTAINS", queryScope: "COLLECTION" }] },
];

writeFileSync("firestore.indexes.json", `${JSON.stringify({ indexes, fieldOverrides }, null, 2)}\n`);
console.log(`Wrote ${indexes.length} composite indexes and ${fieldOverrides.length} field overrides.`);
