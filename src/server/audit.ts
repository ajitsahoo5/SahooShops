import "server-only";
import type { Transaction, WriteBatch } from "firebase-admin/firestore";
import type { Actor } from "./auth";
import { COL, col, nowIso } from "./collections";
import type { AuditLogDoc } from "./types";

export function writeAudit(
  writer: Transaction | WriteBatch,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  summary: string,
  data?: Record<string, unknown>,
): void {
  const doc: AuditLogDoc = {
    action,
    entityType,
    entityId,
    summary,
    data,
    actorUid: actor.uid,
    actorEmail: actor.email,
    createdAt: nowIso(),
  };
  const ref = col(COL.auditLogs).doc();
  if ("getAll" in writer) writer.set(ref, doc);
  else writer.set(ref, doc);
}
