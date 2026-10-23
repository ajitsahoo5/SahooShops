import { docIdSchema } from "@/lib/schemas/common";
import { saleReturnSchema } from "@/lib/schemas/payment";
import { adminRoute, parseBody } from "@/server/http";
import { createSaleReturn } from "@/server/sales/returns";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) =>
  createSaleReturn(actor, docIdSchema.parse(params.id), await parseBody(req, saleReturnSchema)),
);
