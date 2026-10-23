import "server-only";
import { createHash } from "node:crypto";
import { archiveCutoff, businessDate } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col, nowIso, withId } from "../collections";
import { db, storageBucket } from "../firebaseAdmin";
import type { ArchiveBatchDoc, PurchaseDoc, SaleDoc, WithId } from "../types";
import { buildArchiveWorkbook, parseArchiveWorkbook } from "./workbook";

/** Upper limit per type in one batch, keeping workbooks and batch documents small. */
export const MAX_PER_BATCH = 2000;
const COMMIT_CHUNK = 200;
const OPEN_STATUSES: ArchiveBatchDoc["status"][] = ["pending", "generated", "verified", "failed"];

type InvoiceCollection = typeof COL.sales | typeof COL.purchases;

function isEligible(doc: SaleDoc | PurchaseDoc, cutoff: string): boolean {
  return !doc.archived && doc.status !== "draft" && doc.businessDate < cutoff;
}

async function eligibleIds(collection: InvoiceCollection, cutoff: string): Promise<{ ids: string[]; total: number }> {
  const snap = await col(collection)
    .where("archived", "==", false)
    .where("businessDate", "<", cutoff)
    .orderBy("businessDate")
    .limit(MAX_PER_BATCH * 2)
    .get();
  const docs = snap.docs.filter((d) => isEligible(d.data() as SaleDoc | PurchaseDoc, cutoff)).slice(0, MAX_PER_BATCH);
  return {
    ids: docs.map((d) => d.id),
    total: docs.reduce((s, d) => s + (d.data() as SaleDoc | PurchaseDoc).totals.totalPaise, 0),
  };
}

async function loadMany<T>(collection: InvoiceCollection, ids: string[]): Promise<WithId<T>[]> {
  const out: WithId<T>[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const refs = ids.slice(i, i + 300).map((id) => col(collection).doc(id));
    if (refs.length === 0) continue;
    const snaps = await db().getAll(...refs);
    for (const s of snaps) {
      if (!s.exists) throw new DomainError("ARCHIVE_VERIFICATION_FAILED", `Transaction ${s.id} no longer exists.`);
      out.push(withId<T>(s));
    }
  }
  return out;
}

async function getBatch(id: string): Promise<WithId<ArchiveBatchDoc>> {
  const snap = await col(COL.archiveBatches).doc(id).get();
  if (!snap.exists) throw new DomainError("NOT_FOUND", "Archive batch not found.");
  return withId<ArchiveBatchDoc>(snap);
}

export async function listBatches(): Promise<WithId<ArchiveBatchDoc>[]> {
  const snap = await col(COL.archiveBatches).orderBy("createdAt", "desc").limit(50).get();
  return snap.docs.map((d) => withId<ArchiveBatchDoc>(d));
}

export async function archiveOverview(): Promise<{ cutoff: string; eligibleSales: number; eligiblePurchases: number }> {
  const cutoff = archiveCutoff(businessDate());
  const count = async (collection: InvoiceCollection) =>
    (await col(collection).where("archived", "==", false).where("businessDate", "<", cutoff).count().get()).data().count;
  const [eligibleSales, eligiblePurchases] = await Promise.all([count(COL.sales), count(COL.purchases)]);
  return { cutoff, eligibleSales, eligiblePurchases };
}

/** Step 1: snapshot the eligible transactions into a pending batch. Only one batch can be open. */
export async function createArchivePreview(actor: Actor, today = businessDate()): Promise<WithId<ArchiveBatchDoc>> {
  const cutoff = archiveCutoff(today);
  const [sales, purchases] = await Promise.all([eligibleIds(COL.sales, cutoff), eligibleIds(COL.purchases, cutoff)]);
  if (sales.ids.length === 0 && purchases.ids.length === 0) {
    throw new DomainError("INVALID_STATE", `No transactions dated before ${cutoff} are waiting to be archived.`);
  }
  return db().runTransaction(async (tx) => {
    const open = await tx.get(col(COL.archiveBatches).where("status", "in", OPEN_STATUSES).limit(1));
    if (!open.empty) {
      throw new DomainError("INVALID_STATE", "Finish or cancel the open archive batch before starting a new one.");
    }
    const ref = col(COL.archiveBatches).doc();
    const now = nowIso();
    const doc: ArchiveBatchDoc = {
      status: "pending",
      cutoffDate: cutoff,
      saleIds: sales.ids,
      purchaseIds: purchases.ids,
      saleCount: sales.ids.length,
      purchaseCount: purchases.ids.length,
      salesTotalPaise: sales.total,
      purchasesTotalPaise: purchases.total,
      filePath: null,
      fileSha256: null,
      fileSizeBytes: null,
      verifiedAt: null,
      failureReason: null,
      committedAt: null,
      createdAt: now,
      updatedAt: now,
      actorUid: actor.uid,
    };
    tx.set(ref, doc);
    writeAudit(tx, actor, "archive.preview", "archiveBatch", ref.id, `Archive preview: ${doc.saleCount} sales, ${doc.purchaseCount} purchases before ${cutoff}`);
    return { id: ref.id, ...doc };
  });
}

async function failBatch(actor: Actor, id: string, reason: string): Promise<never> {
  const batch = db().batch();
  batch.update(col(COL.archiveBatches).doc(id), { status: "failed", failureReason: reason, updatedAt: nowIso() });
  writeAudit(batch, actor, "archive.failed", "archiveBatch", id, `Archive verification failed: ${reason}`);
  await batch.commit();
  throw new DomainError("ARCHIVE_VERIFICATION_FAILED", `Archive check failed: ${reason}. Nothing was archived.`);
}

/** Step 2: build the Excel archive from current Firestore data and store it in Cloud Storage. */
export async function generateArchive(actor: Actor, id: string): Promise<WithId<ArchiveBatchDoc>> {
  const batch = await getBatch(id);
  if (batch.status !== "pending" && batch.status !== "failed") {
    throw new DomainError("INVALID_STATE", "This batch has already been generated.");
  }
  const [sales, purchases] = await Promise.all([
    loadMany<SaleDoc>(COL.sales, batch.saleIds),
    loadMany<PurchaseDoc>(COL.purchases, batch.purchaseIds),
  ]);
  const ineligible = [...sales, ...purchases].find((d) => !isEligible(d, batch.cutoffDate));
  if (ineligible) return failBatch(actor, id, `transaction ${ineligible.number ?? ineligible.id} is no longer eligible`);

  const buffer = await buildArchiveWorkbook(id, batch, sales, purchases);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const filePath = `archives/${batch.cutoffDate}-${id}.xlsx`;
  await storageBucket()
    .file(filePath)
    .save(buffer, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      resumable: false,
      metadata: { metadata: { batchId: id, sha256 } },
    });
  const changes = {
    status: "generated" as const,
    filePath,
    fileSha256: sha256,
    fileSizeBytes: buffer.length,
    failureReason: null,
    updatedAt: nowIso(),
  };
  const write = db().batch();
  write.update(col(COL.archiveBatches).doc(id), changes);
  writeAudit(write, actor, "archive.generate", "archiveBatch", id, `Generated archive workbook ${filePath}`);
  await write.commit();
  return { ...batch, ...changes };
}

export async function readArchiveFile(batch: ArchiveBatchDoc): Promise<Buffer> {
  if (!batch.filePath) throw new DomainError("INVALID_STATE", "The archive file has not been generated yet.");
  const [contents] = await storageBucket().file(batch.filePath).download();
  return contents;
}

/**
 * Step 3: download the stored workbook, check its hash, re-parse it, and compare IDs, counts,
 * and totals with both the batch and the live Firestore records. Any mismatch fails the batch.
 */
export async function verifyArchive(actor: Actor, id: string): Promise<WithId<ArchiveBatchDoc>> {
  const batch = await getBatch(id);
  if (batch.status !== "generated") throw new DomainError("INVALID_STATE", "Generate the archive file before verifying it.");

  let buffer: Buffer;
  try {
    buffer = await readArchiveFile(batch);
  } catch {
    return failBatch(actor, id, "the archive file could not be read from storage");
  }
  if (createHash("sha256").update(buffer).digest("hex") !== batch.fileSha256) {
    return failBatch(actor, id, "the stored file does not match its recorded checksum");
  }
  let parsed;
  try {
    parsed = await parseArchiveWorkbook(buffer);
  } catch (error) {
    return failBatch(actor, id, `the workbook could not be read (${(error as Error).message})`);
  }
  const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => new Set(b).has(x));
  if (parsed.batchId !== id) return failBatch(actor, id, "the workbook belongs to a different batch");
  if (!sameSet(parsed.saleIds, batch.saleIds)) return failBatch(actor, id, "sales in the file do not match the batch");
  if (!sameSet(parsed.purchaseIds, batch.purchaseIds)) return failBatch(actor, id, "purchases in the file do not match the batch");

  const [sales, purchases] = await Promise.all([
    loadMany<SaleDoc>(COL.sales, batch.saleIds),
    loadMany<PurchaseDoc>(COL.purchases, batch.purchaseIds),
  ]);
  const liveSales = sales.reduce((s, x) => s + x.totals.totalPaise, 0);
  const livePurchases = purchases.reduce((s, x) => s + x.totals.totalPaise, 0);
  if (parsed.salesTotalPaise !== liveSales || parsed.salesTotalPaise !== batch.salesTotalPaise) {
    return failBatch(actor, id, "sales totals in the file do not match Sahoo Shop records");
  }
  if (parsed.purchasesTotalPaise !== livePurchases || parsed.purchasesTotalPaise !== batch.purchasesTotalPaise) {
    return failBatch(actor, id, "purchase totals in the file do not match Sahoo Shop records");
  }
  const ineligible = [...sales, ...purchases].find((d) => !isEligible(d, batch.cutoffDate));
  if (ineligible) return failBatch(actor, id, `transaction ${ineligible.number ?? ineligible.id} is no longer eligible`);

  const changes = { status: "verified" as const, verifiedAt: nowIso(), updatedAt: nowIso() };
  const write = db().batch();
  write.update(col(COL.archiveBatches).doc(id), changes);
  writeAudit(write, actor, "archive.verify", "archiveBatch", id, "Archive workbook verified");
  await write.commit();
  return { ...batch, ...changes };
}

async function markArchived(collection: InvoiceCollection, ids: string[], batchId: string, cutoff: string, at: string): Promise<number> {
  let marked = 0;
  for (let i = 0; i < ids.length; i += COMMIT_CHUNK) {
    const chunk = ids.slice(i, i + COMMIT_CHUNK);
    marked += await db().runTransaction(async (tx) => {
      const refs = chunk.map((id) => col(collection).doc(id));
      const snaps = await tx.getAll(...refs);
      let count = 0;
      snaps.forEach((snap, j) => {
        if (!snap.exists || !isEligible(snap.data() as SaleDoc | PurchaseDoc, cutoff)) return;
        // Only the archive flags change. Amounts, stock, and balances are never touched.
        tx.update(refs[j], { archived: true, archivedAt: at, archiveBatchId: batchId });
        count++;
      });
      return count;
    });
  }
  return marked;
}

/** Step 4: after the administrator confirms, mark the verified transactions as archived. */
export async function commitArchive(actor: Actor, id: string, confirmBatchId: string): Promise<{ marked: number }> {
  if (confirmBatchId.trim() !== id) throw new DomainError("VALIDATION", "Type the batch ID exactly to confirm.");
  const batch = await getBatch(id);
  if (batch.status !== "verified") throw new DomainError("INVALID_STATE", "Only verified batches can be archived.");
  // Marking is safe to retry: already-archived records are skipped, and the batch stays
  // "verified" until every chunk has been written.
  const at = nowIso();
  const marked =
    (await markArchived(COL.sales, batch.saleIds, id, batch.cutoffDate, at)) +
    (await markArchived(COL.purchases, batch.purchaseIds, id, batch.cutoffDate, at));
  await db().runTransaction(async (tx) => {
    const ref = col(COL.archiveBatches).doc(id);
    const snap = await tx.get(ref);
    if ((snap.data() as ArchiveBatchDoc).status !== "verified") return;
    tx.update(ref, { status: "committed", committedAt: at, updatedAt: nowIso() });
    writeAudit(tx, actor, "archive.commit", "archiveBatch", id, `Archived ${marked} transactions dated before ${batch.cutoffDate}`);
  });
  return { marked };
}

export async function cancelArchive(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.archiveBatches).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Archive batch not found.");
    const data = snap.data() as ArchiveBatchDoc;
    if (data.status === "committed" || data.status === "cancelled") {
      throw new DomainError("INVALID_STATE", "This batch can no longer be cancelled.");
    }
    tx.update(ref, { status: "cancelled", updatedAt: nowIso() });
    writeAudit(tx, actor, "archive.cancel", "archiveBatch", id, "Cancelled archive batch");
  });
}

export { getBatch };
