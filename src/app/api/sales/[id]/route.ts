import { DomainError } from "@/lib/errors";
import { docIdSchema } from "@/lib/schemas/common";
import { saleDraftSchema } from "@/lib/schemas/invoice";
import { COL } from "@/server/collections";
import { adminRoute, parseBody } from "@/server/http";
import { getInvoice, listInvoicePayments, listSaleReturns } from "@/server/invoices/queries";
import { deleteSaleDraft, updateSaleDraft } from "@/server/sales/service";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const id = docIdSchema.parse(params.id);
  const sale = await getInvoice(COL.sales, id);
  if (!sale) throw new DomainError("NOT_FOUND", "Sale not found.");
  const [payments, returns] = await Promise.all([listInvoicePayments(id), listSaleReturns(id)]);
  return { sale, payments, returns };
});

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  await updateSaleDraft(actor, docIdSchema.parse(params.id), await parseBody(req, saleDraftSchema));
  return { ok: true };
});

export const DELETE = adminRoute<{ id: string }>(async ({ actor, params }) => {
  await deleteSaleDraft(actor, docIdSchema.parse(params.id));
  return { ok: true };
});
