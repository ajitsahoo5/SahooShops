import { createSaleSchema, invoiceListQuerySchema } from "@/lib/schemas/invoice";
import { COL } from "@/server/collections";
import { adminRoute, parseBody, parseQuery } from "@/server/http";
import { listInvoices } from "@/server/invoices/queries";
import { createSale } from "@/server/sales/service";

export const GET = adminRoute(async ({ req }) => ({
  items: await listInvoices(COL.sales, parseQuery(req, invoiceListQuerySchema)),
}));

export const POST = adminRoute(async ({ req, actor }) => createSale(actor, await parseBody(req, createSaleSchema)));
