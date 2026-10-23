import { docIdSchema } from "@/lib/schemas/common";
import { categorySchema } from "@/lib/schemas/product";
import { adminRoute, parseBody } from "@/server/http";
import { deleteCategory, renameCategory } from "@/server/products/categories";

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  const { name } = await parseBody(req, categorySchema);
  await renameCategory(actor, docIdSchema.parse(params.id), name);
  return { ok: true };
});

export const DELETE = adminRoute<{ id: string }>(async ({ actor, params }) => {
  await deleteCategory(actor, docIdSchema.parse(params.id));
  return { ok: true };
});
