import { expenseListQuerySchema, expenseSchema } from "@/lib/schemas/payment";
import { createExpense, listExpenses } from "@/server/expenses/service";
import { adminRoute, parseBody, parseQuery } from "@/server/http";

export const GET = adminRoute(async ({ req }) => ({ items: await listExpenses(parseQuery(req, expenseListQuerySchema)) }));

export const POST = adminRoute(async ({ req, actor }) => createExpense(actor, await parseBody(req, expenseSchema)));
