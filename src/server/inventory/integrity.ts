import "server-only";
import { COL, col } from "../collections";
import type { BalanceStatsDoc, InventoryStatsDoc, PartyDoc, ProductDoc, StockMovementDoc } from "../types";

export interface IntegrityIssue {
  kind: "product" | "inventoryStat" | "balanceStat";
  id: string;
  message: string;
}

/**
 * Recomputes balances from source records and compares them with stored running totals:
 * product stock vs. its ledger, `stats/inventory` vs. products, `stats/balances` vs. parties.
 */
export async function checkIntegrity(): Promise<{ issues: IntegrityIssue[]; productsChecked: number; movementsChecked: number }> {
  const [products, movements, customers, suppliers, stats] = await Promise.all([
    col(COL.products).get(),
    col(COL.stockMovements).get(),
    col(COL.customers).get(),
    col(COL.suppliers).get(),
    col(COL.stats).get(),
  ]);
  const ledger = new Map<string, { qty: number; value: number }>();
  for (const doc of movements.docs) {
    const m = doc.data() as StockMovementDoc;
    const entry = ledger.get(m.productId) ?? { qty: 0, value: 0 };
    entry.qty += m.qtyDeltaMilli;
    entry.value += m.valueDeltaPaise;
    ledger.set(m.productId, entry);
  }

  const issues: IntegrityIssue[] = [];
  let inventoryValue = 0;
  for (const doc of products.docs) {
    const p = doc.data() as ProductDoc;
    const l = ledger.get(doc.id) ?? { qty: 0, value: 0 };
    inventoryValue += p.stockValuePaise;
    if (l.qty !== p.stockQtyMilli || l.value !== p.stockValuePaise) {
      issues.push({
        kind: "product",
        id: doc.id,
        message: `${p.sku}: stored ${p.stockQtyMilli}/${p.stockValuePaise}, ledger ${l.qty}/${l.value}`,
      });
    }
    if (p.stockQtyMilli >= 0 && p.stockValuePaise < 0) {
      issues.push({ kind: "product", id: doc.id, message: `${p.sku}: negative stock value with non-negative quantity` });
    }
  }

  const statDocs = new Map(stats.docs.map((d) => [d.id, d.data()]));
  const inventory = (statDocs.get("inventory") ?? {}) as Partial<InventoryStatsDoc>;
  if ((inventory.valuePaise ?? 0) !== inventoryValue) {
    issues.push({ kind: "inventoryStat", id: "inventory", message: `stats ${inventory.valuePaise ?? 0}, products ${inventoryValue}` });
  }
  if ((inventory.productCount ?? 0) !== products.size) {
    issues.push({ kind: "inventoryStat", id: "inventory", message: `product count ${inventory.productCount ?? 0}, actual ${products.size}` });
  }
  const balances = (statDocs.get("balances") ?? {}) as Partial<BalanceStatsDoc>;
  const receivable = customers.docs.reduce((s, d) => s + (d.data() as PartyDoc).balancePaise, 0);
  const payable = suppliers.docs.reduce((s, d) => s + (d.data() as PartyDoc).balancePaise, 0);
  if ((balances.receivablePaise ?? 0) !== receivable) {
    issues.push({ kind: "balanceStat", id: "balances", message: `receivable stats ${balances.receivablePaise ?? 0}, customers ${receivable}` });
  }
  if ((balances.payablePaise ?? 0) !== payable) {
    issues.push({ kind: "balanceStat", id: "balances", message: `payable stats ${balances.payablePaise ?? 0}, suppliers ${payable}` });
  }

  return { issues, productsChecked: products.size, movementsChecked: movements.size };
}
