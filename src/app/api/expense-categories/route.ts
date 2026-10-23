import { categorySchema } from "@/lib/schemas/product";
import { createExpenseCategory, listExpenseCategories } from "@/server/expenses/service";
import { adminRoute, parseBody } from "@/server/http";

export const GET = adminRoute(async () => ({ items: await listExpenseCategories() }));

export const POST = adminRoute(async ({ req, actor }) => {
  const { name } = await parseBody(req, categorySchema);
  return createExpenseCategory(actor, name);
});
