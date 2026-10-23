import { docIdSchema } from "@/lib/schemas/common";
import { voidExpenseSchema } from "@/lib/schemas/payment";
import { voidExpense } from "@/server/expenses/service";
import { adminRoute, parseBody } from "@/server/http";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  const { reason } = await parseBody(req, voidExpenseSchema);
  await voidExpense(actor, docIdSchema.parse(params.id), reason);
  return { ok: true };
});
