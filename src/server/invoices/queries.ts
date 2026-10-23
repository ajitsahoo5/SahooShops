import "server-only";
import type { Query } from "firebase-admin/firestore";
import type { InvoiceListQuery } from "@/lib/schemas/invoice";
import { COL, col, withId } from "../collections";
import type { PaymentDoc, PurchaseDoc, SaleDoc, SaleReturnDoc, WithId } from "../types";

type InvoiceCollection = typeof COL.sales | typeof COL.purchases;

export async function listInvoices<T extends SaleDoc | PurchaseDoc>(
  collection: InvoiceCollection,
  filters: Partial<InvoiceListQuery> & { limit?: number },
): Promise<WithId<T>[]> {
  const partyField = collection === COL.sales ? "customerId" : "supplierId";
  let query: Query = col(collection);
  if (filters.number) {
    query = query.where("number", "==", filters.number.toUpperCase());
  } else {
    if (!filters.includeArchived) query = query.where("archived", "==", false);
    if (filters.status) query = query.where("status", "==", filters.status);
    if (filters.partyId) query = query.where(partyField, "==", filters.partyId);
    if (filters.from) query = query.where("businessDate", ">=", filters.from);
    if (filters.to) query = query.where("businessDate", "<=", filters.to);
    query = query.orderBy("businessDate", "desc");
  }
  const snap = await query.limit(filters.limit ?? 300).get();
  return snap.docs
    .map((d) => withId<T>(d))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.localeCompare(a.createdAt));
}

export async function getInvoice<T extends SaleDoc | PurchaseDoc>(
  collection: InvoiceCollection,
  id: string,
): Promise<WithId<T> | null> {
  const snap = await col(collection).doc(id).get();
  return snap.exists ? withId<T>(snap) : null;
}

/** Receipts, payments, refunds, and reversals linked to an invoice, oldest first. */
export async function listInvoicePayments(invoiceId: string): Promise<WithId<PaymentDoc>[]> {
  const [allocated, referenced] = await Promise.all([
    col(COL.payments).where("allocationRefIds", "array-contains", invoiceId).get(),
    col(COL.payments).where("refId", "==", invoiceId).get(),
  ]);
  const byId = new Map<string, WithId<PaymentDoc>>();
  for (const d of [...allocated.docs, ...referenced.docs]) byId.set(d.id, withId<PaymentDoc>(d));
  // Include reversal records of payments allocated to this invoice.
  const reversalIds = [...byId.values()].map((p) => p.reversedBy).filter((id): id is string => Boolean(id) && !byId.has(id!));
  if (reversalIds.length) {
    const snaps = await col(COL.payments).firestore.getAll(...reversalIds.map((id) => col(COL.payments).doc(id)));
    for (const s of snaps) if (s.exists) byId.set(s.id, withId<PaymentDoc>(s));
  }
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listSaleReturns(saleId: string): Promise<WithId<SaleReturnDoc>[]> {
  const snap = await col(COL.salesReturns).where("saleId", "==", saleId).get();
  return snap.docs.map((d) => withId<SaleReturnDoc>(d)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
