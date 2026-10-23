import { z } from "zod";
import { adminRoute, parseQuery } from "@/server/http";
import { searchProducts } from "@/server/products/service";
import { toProductView } from "@/server/products/view";

const querySchema = z.object({ q: z.string().trim().min(1).max(60) });

export const GET = adminRoute(async ({ req }) => {
  const { q } = parseQuery(req, querySchema);
  const items = await searchProducts(q);
  return { items: items.map(toProductView) };
});
