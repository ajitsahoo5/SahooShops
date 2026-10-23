import { stockAdjustmentSchema } from "@/lib/schemas/product";
import { adminRoute, parseBody } from "@/server/http";
import { adjustStock } from "@/server/products/service";

export const POST = adminRoute(async ({ req, actor }) => {
  const input = await parseBody(req, stockAdjustmentSchema);
  return adjustStock(actor, input);
});
