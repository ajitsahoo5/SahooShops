import { DomainError } from "@/lib/errors";
import { docIdSchema } from "@/lib/schemas/common";
import { purchaseDraftSchema } from "@/lib/schemas/invoice";
import { COL } from "@/server/collections";
import { adminRoute, parseBody } from "@/server/http";
import { getInvoice, listInvoicePayments } from "@/server/invoices/queries";
import { deletePurchaseDraft, updatePurchaseDraft } from "@/server/purchases/service";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const id = docIdSchema.parse(params.id);
  const purchase = await getInvoice(COL.purchases, id);
  if (!purchase) throw new DomainError("NOT_FOUND", "Purchase not found.");
  return { purchase, payments: await listInvoicePayments(id) };
});

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  await updatePurchaseDraft(actor, docIdSchema.parse(params.id), await parseBody(req, purchaseDraftSchema));
  return { ok: true };
});

export const DELETE = adminRoute<{ id: string }>(async ({ actor, params }) => {
  await deletePurchaseDraft(actor, docIdSchema.parse(params.id));
  return { ok: true };
});
