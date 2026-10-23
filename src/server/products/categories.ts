import "server-only";
import { DomainError } from "@/lib/errors";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col, nowIso, withId } from "../collections";
import { db } from "../firebaseAdmin";
import type { CategoryDoc, WithId } from "../types";

export async function listCategories(): Promise<WithId<CategoryDoc>[]> {
  const snap = await col(COL.categories).orderBy("nameLower").limit(500).get();
  return snap.docs.map((d) => withId<CategoryDoc>(d));
}

export async function createCategory(actor: Actor, name: string): Promise<{ id: string }> {
  const nameLower = name.toLowerCase();
  return db().runTransaction(async (tx) => {
    const dup = await tx.get(col(COL.categories).where("nameLower", "==", nameLower).limit(1));
    if (!dup.empty) throw new DomainError("CONFLICT", `Category "${name}" already exists.`);
    const ref = col(COL.categories).doc();
    const now = nowIso();
    tx.set(ref, { name, nameLower, createdAt: now, updatedAt: now } satisfies CategoryDoc);
    writeAudit(tx, actor, "category.create", "category", ref.id, `Created category ${name}`);
    return { id: ref.id };
  });
}

export async function renameCategory(actor: Actor, id: string, name: string): Promise<void> {
  const nameLower = name.toLowerCase();
  await db().runTransaction(async (tx) => {
    const ref = col(COL.categories).doc(id);
    const [snap, dup] = await Promise.all([
      tx.get(ref),
      tx.get(col(COL.categories).where("nameLower", "==", nameLower).limit(1)),
    ]);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Category not found.");
    if (!dup.empty && dup.docs[0].id !== id) throw new DomainError("CONFLICT", `Category "${name}" already exists.`);
    tx.update(ref, { name, nameLower, updatedAt: nowIso() });
    writeAudit(tx, actor, "category.rename", "category", id, `Renamed category to ${name}`);
  });
}

export async function deleteCategory(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.categories).doc(id);
    const [snap, used] = await Promise.all([
      tx.get(ref),
      tx.get(col(COL.products).where("categoryId", "==", id).limit(1)),
    ]);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Category not found.");
    if (!used.empty) throw new DomainError("INVALID_STATE", "Move or delete the products in this category first.");
    tx.delete(ref);
    writeAudit(tx, actor, "category.delete", "category", id, `Deleted category ${snap.data()?.name}`);
  });
}
