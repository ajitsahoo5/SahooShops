import { docIdSchema } from "@/lib/schemas/common";
import { reverseInvoiceSchema } from "@/lib/schemas/invoice";
import { adminRoute, parseBody } from "@/server/http";
import { reverseSale } from "@/server/sales/service";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) =>
  reverseSale(actor, docIdSchema.parse(params.id), await parseBody(req, reverseInvoiceSchema)),
);
