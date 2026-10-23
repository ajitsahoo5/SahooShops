import "server-only";
import { invoiceListQuerySchema, type InvoiceListQuery } from "@/lib/schemas/invoice";
import { param, type RawSearchParams } from "@/lib/search-params";
import { getProduct } from "../products/service";
import type { InvoiceLine } from "../types";

export function parseInvoiceFilters(sp: RawSearchParams): Partial<InvoiceListQuery> {
  const parsed = invoiceListQuerySchema.safeParse({
    from: param(sp, "from"),
    to: param(sp, "to"),
    status: param(sp, "status"),
    partyId: param(sp, "partyId"),
    number: param(sp, "number"),
    includeArchived: param(sp, "includeArchived"),
  });
  return parsed.success ? parsed.data : {};
}

/** Adds current stock levels to draft lines for the editor. */
export async function editorLines(items: InvoiceLine[]) {
  const products = await Promise.all([...new Set(items.map((i) => i.productId))].map((id) => getProduct(id)));
  const stock = new Map(products.filter(Boolean).map((p) => [p!.id, p!.stockQtyMilli]));
  return items.map((l) => ({
    productId: l.productId,
    sku: l.sku,
    name: l.name,
    unit: l.unit,
    stockQtyMilli: stock.get(l.productId) ?? 0,
    qtyMilli: l.qtyMilli,
    unitPricePaise: l.unitPricePaise,
    discountPaise: l.discountPaise,
  }));
}
