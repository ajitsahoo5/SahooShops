import "server-only";
import type { Query, Transaction } from "firebase-admin/firestore";
import { DomainError } from "@/lib/errors";
import type { PartyInput } from "@/lib/schemas/party";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col, nowIso, withId } from "../collections";
import { db } from "../firebaseAdmin";
import type { PartyDoc, PartyType, WithId } from "../types";

export function partyCollection(type: PartyType) {
  return col(type === "customer" ? COL.customers : COL.suppliers);
}

export async function listParties(
  type: PartyType,
  options: { activeOnly?: boolean; withBalanceOnly?: boolean; limit?: number } = {},
): Promise<WithId<PartyDoc>[]> {
  let query: Query = partyCollection(type);
  if (options.withBalanceOnly) {
    query = query.where("balancePaise", ">", 0).orderBy("balancePaise", "desc");
  } else {
    if (options.activeOnly) query = query.where("active", "==", true);
    query = query.orderBy("nameLower");
  }
  const snap = await query.limit(options.limit ?? 1000).get();
  return snap.docs.map((d) => withId<PartyDoc>(d));
}

export async function getParty(type: PartyType, id: string): Promise<WithId<PartyDoc> | null> {
  const snap = await partyCollection(type).doc(id).get();
  return snap.exists ? withId<PartyDoc>(snap) : null;
}

/** Reads a party inside a transaction, failing if it does not exist. */
export async function readPartyTx(tx: Transaction, type: PartyType, id: string): Promise<WithId<PartyDoc>> {
  const snap = await tx.get(partyCollection(type).doc(id));
  if (!snap.exists) throw new DomainError("NOT_FOUND", `${type === "customer" ? "Customer" : "Supplier"} not found.`);
  return withId<PartyDoc>(snap);
}

export async function createParty(actor: Actor, type: PartyType, input: PartyInput): Promise<{ id: string }> {
  return db().runTransaction(async (tx) => {
    const ref = partyCollection(type).doc();
    const now = nowIso();
    const doc: PartyDoc = {
      ...input,
      nameLower: input.name.toLowerCase(),
      balancePaise: 0,
      createdAt: now,
      updatedAt: now,
    };
    tx.set(ref, doc);
    writeAudit(tx, actor, `${type}.create`, type, ref.id, `Created ${type} ${input.name}`);
    return { id: ref.id };
  });
}

export async function updateParty(actor: Actor, type: PartyType, id: string, input: PartyInput): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = partyCollection(type).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", `${type === "customer" ? "Customer" : "Supplier"} not found.`);
    tx.update(ref, { ...input, nameLower: input.name.toLowerCase(), updatedAt: nowIso() });
    writeAudit(tx, actor, `${type}.update`, type, id, `Updated ${type} ${input.name}`);
  });
}
