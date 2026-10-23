import { paymentListQuerySchema, recordPaymentSchema } from "@/lib/schemas/payment";
import { adminRoute, parseBody, parseQuery } from "@/server/http";
import { listPayments, recordPartyPayment } from "@/server/payments/service";

export const GET = adminRoute(async ({ req }) => ({ items: await listPayments(parseQuery(req, paymentListQuerySchema)) }));

export const POST = adminRoute(async ({ req, actor }) => recordPartyPayment(actor, await parseBody(req, recordPaymentSchema)));
