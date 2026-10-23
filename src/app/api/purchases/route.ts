import { createPurchaseSchema, invoiceListQuerySchema } from "@/lib/schemas/invoice";
import { COL } from "@/server/collections";
import { adminRoute, parseBody, parseQuery } from "@/server/http";
import { listInvoices } from "@/server/invoices/queries";
import { createPurchase } from "@/server/purchases/service";

export const GET = adminRoute(async ({ req }) => ({
  items: await listInvoices(COL.purchases, parseQuery(req, invoiceListQuerySchema)),
}));

export const POST = adminRoute(async ({ req, actor }) =>
  createPurchase(actor, await parseBody(req, createPurchaseSchema)),
);
