import "server-only";
import { monthKeyOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { proRataPortion } from "@/lib/invoice-math";
import { formatINR } from "@/lib/money";
import type { SaleReturnInput } from "@/lib/schemas/payment";
import type { Actor } from "../auth";
import { COL, col } from "../collections";
import { writeMoneyRecord } from "../payments/records";
import { runPosting } from "../posting/context";
import type { SaleDoc, SaleReturnDoc, SaleReturnLine } from "../types";

/**
 * Records goods returned against a posted sale. Stock comes back at the cost originally charged,
 * the return value first reduces what the customer still owes, and any excess is refunded.
 */
export async function createSaleReturn(
  actor: Actor,
  saleId: string,
  input: SaleReturnInput,
): Promise<{ id: string; number: string }> {
  return runPosting(actor, input.idempotencyKey, "sale.return", async (ctx) => {
    const saleRef = col(COL.sales).doc(saleId);
    const snap = await ctx.tx.get(saleRef);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Sale not found.");
    const sale = snap.data() as SaleDoc;
    if (sale.status !== "posted") throw new DomainError("INVALID_STATE", "Returns can only be recorded against posted sales.");
    if (input.businessDate < sale.businessDate) {
      throw new DomainError("VALIDATION", "The return date cannot be before the sale date.");
    }
    await ctx.loadProducts(sale.items.map((l) => l.productId));
    const number = await ctx.reserveNumber("saleReturn", ctx.settings.returnPrefix);
    const returnRef = col(COL.salesReturns).doc();

    const qtyByLine = new Map<number, number>();
    for (const item of input.items) qtyByLine.set(item.lineIndex, (qtyByLine.get(item.lineIndex) ?? 0) + item.qtyMilli);

    const items = sale.items.map((l) => ({ ...l }));
    const returnLines: SaleReturnLine[] = [];
    let totalPaise = 0;
    let cogsPaise = 0;
    for (const [lineIndex, qtyMilli] of qtyByLine) {
      const line = items[lineIndex];
      if (!line) throw new DomainError("VALIDATION", `Line ${lineIndex + 1} does not exist on this sale.`);
      const remaining = line.qtyMilli - line.returnedQtyMilli;
      if (qtyMilli > remaining) {
        throw new DomainError("VALIDATION", `Only ${remaining / 1000} ${line.unit} of ${line.name} can still be returned.`);
      }
      const value = proRataPortion(line.netPaise, line.qtyMilli, line.returnedQtyMilli, qtyMilli);
      const cogs = proRataPortion(line.costOfGoodsPaise, line.qtyMilli, line.returnedQtyMilli, qtyMilli);
      ctx.move(
        line.productId,
        { kind: "in", qtyMilli, valuePaise: cogs },
        { type: "SALE_RETURN", refType: "saleReturn", refId: saleId, refNumber: number, businessDate: input.businessDate, note: input.reason },
      );
      ctx.summary(input.businessDate, {
        productSales: { [line.productId]: { qtyMilli: -qtyMilli, revenuePaise: -value, cogsPaise: -cogs } },
      });
      line.returnedQtyMilli += qtyMilli;
      line.returnedValuePaise += value;
      line.returnedCogsPaise += cogs;
      totalPaise += value;
      cogsPaise += cogs;
      returnLines.push({ lineIndex, productId: line.productId, name: line.name, qtyMilli, valuePaise: value, cogsPaise: cogs });
    }

    const dueReductionPaise = Math.min(totalPaise, sale.duePaise);
    const refundPaise = totalPaise - dueReductionPaise;
    if (refundPaise > 0) {
      writeMoneyRecord(ctx, {
        kind: "refund",
        direction: "out",
        method: input.refundMethod,
        amountPaise: refundPaise,
        partyType: sale.customerId ? "customer" : null,
        partyId: sale.customerId,
        partyName: sale.customerName,
        refType: "sale",
        refId: saleId,
        businessDate: input.businessDate,
        reason: `Return ${number}: ${input.reason}`,
      });
    }
    if (dueReductionPaise > 0 && sale.customerId) ctx.partyBalance("customer", sale.customerId, -dueReductionPaise);

    const doc: SaleReturnDoc = {
      number,
      saleId,
      saleNumber: sale.number ?? "",
      customerId: sale.customerId,
      customerName: sale.customerName,
      businessDate: input.businessDate,
      monthKey: monthKeyOf(input.businessDate),
      items: returnLines,
      totalPaise,
      cogsPaise,
      dueReductionPaise,
      refundPaise,
      refundMethod: refundPaise > 0 ? input.refundMethod : null,
      reason: input.reason,
      createdAt: ctx.now,
      actorUid: actor.uid,
    };
    ctx.tx.set(returnRef, doc);
    const newDue = sale.duePaise - dueReductionPaise;
    ctx.tx.update(saleRef, {
      items,
      returnedPaise: sale.returnedPaise + totalPaise,
      returnedCogsPaise: sale.returnedCogsPaise + cogsPaise,
      refundedPaise: sale.refundedPaise + refundPaise,
      duePaise: newDue,
      isOpen: newDue > 0,
      updatedAt: ctx.now,
    });
    ctx.summary(input.businessDate, { returnsPaise: totalPaise, returnsCogsPaise: cogsPaise });
    ctx.audit("sale.return", "sale", saleId, `Return ${number} on ${sale.number} for ${formatINR(totalPaise)}`, {
      refundPaise,
      dueReductionPaise,
    });
    return { id: returnRef.id, number };
  });
}
