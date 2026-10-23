import "server-only";
import { monthKeyOf, type BusinessDate } from "@/lib/dates";
import { COL, col } from "../collections";
import type { PostingContext } from "../posting/context";
import type { PartyType, PaymentAllocation, PaymentDoc, PaymentKind, PaymentMethod } from "../types";

export interface MoneyRecordInput {
  kind: PaymentKind;
  direction: "in" | "out";
  method: PaymentMethod;
  amountPaise: number;
  partyType: PartyType | null;
  partyId: string | null;
  partyName: string | null;
  allocations?: PaymentAllocation[];
  refType: PaymentDoc["refType"];
  refId: string | null;
  businessDate: BusinessDate;
  notes?: string;
  reason?: string;
  reversalOf?: string | null;
  /** When false, the daily cash summary is adjusted separately by the caller. */
  affectsSummary?: boolean;
}

/** Writes one money movement and adds it to that day's cash summary. Returns the payment id. */
export function writeMoneyRecord(ctx: PostingContext, input: MoneyRecordInput): string {
  const ref = col(COL.payments).doc();
  const allocations = input.allocations ?? [];
  const doc: PaymentDoc = {
    kind: input.kind,
    direction: input.direction,
    method: input.method,
    amountPaise: input.amountPaise,
    partyType: input.partyType,
    partyId: input.partyId,
    partyName: input.partyName,
    allocations,
    allocationRefIds: allocations.map((a) => a.refId),
    refType: input.refType,
    refId: input.refId,
    businessDate: input.businessDate,
    monthKey: monthKeyOf(input.businessDate),
    status: "active",
    reversalOf: input.reversalOf ?? null,
    reversedBy: null,
    reason: input.reason ?? "",
    notes: input.notes ?? "",
    createdAt: ctx.now,
    actorUid: ctx.actor.uid,
  };
  ctx.tx.set(ref, doc);
  if (input.affectsSummary !== false) {
    ctx.summary(
      input.businessDate,
      input.direction === "in"
        ? { cashIn: { [input.method]: input.amountPaise } }
        : { cashOut: { [input.method]: input.amountPaise } },
    );
  }
  return ref.id;
}
