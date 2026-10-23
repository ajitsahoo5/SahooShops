import { docIdSchema } from "@/lib/schemas/common";
import { categorySchema } from "@/lib/schemas/product";
import { deleteExpenseCategory, renameExpenseCategory } from "@/server/expenses/service";
import { adminRoute, parseBody } from "@/server/http";

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  const { name } = await parseBody(req, categorySchema);
  await renameExpenseCategory(actor, docIdSchema.parse(params.id), name);
  return { ok: true };
});

export const DELETE = adminRoute<{ id: string }>(async ({ actor, params }) => {
  await deleteExpenseCategory(actor, docIdSchema.parse(params.id));
  return { ok: true };
});
