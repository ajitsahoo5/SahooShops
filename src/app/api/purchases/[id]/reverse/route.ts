import { docIdSchema } from "@/lib/schemas/common";
import { reverseInvoiceSchema } from "@/lib/schemas/invoice";
import { adminRoute, parseBody } from "@/server/http";
import { reversePurchase } from "@/server/purchases/service";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) =>
  reversePurchase(actor, docIdSchema.parse(params.id), await parseBody(req, reverseInvoiceSchema)),
);
