import { docIdSchema } from "@/lib/schemas/common";
import { reversePaymentSchema } from "@/lib/schemas/payment";
import { adminRoute, parseBody } from "@/server/http";
import { reversePayment } from "@/server/payments/service";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) =>
  reversePayment(actor, docIdSchema.parse(params.id), await parseBody(req, reversePaymentSchema)),
);
