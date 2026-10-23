import { categorySchema } from "@/lib/schemas/product";
import { adminRoute, parseBody } from "@/server/http";
import { createCategory, listCategories } from "@/server/products/categories";

export const GET = adminRoute(async () => ({ items: await listCategories() }));

export const POST = adminRoute(async ({ req, actor }) => {
  const { name } = await parseBody(req, categorySchema);
  return createCategory(actor, name);
});
