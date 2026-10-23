import { createProductSchema, productListQuerySchema } from "@/lib/schemas/product";
import { adminRoute, parseBody, parseQuery } from "@/server/http";
import { createProduct, listProducts } from "@/server/products/service";
import { toProductView } from "@/server/products/view";

export const GET = adminRoute(async ({ req }) => {
  const filters = parseQuery(req, productListQuerySchema);
  const { items, truncated } = await listProducts(filters);
  return { items: items.map(toProductView), truncated };
});

export const POST = adminRoute(async ({ req, actor }) => {
  const input = await parseBody(req, createProductSchema);
  return createProduct(actor, input);
});
