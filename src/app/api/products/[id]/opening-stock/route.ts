import { docIdSchema } from "@/lib/schemas/common";
import { setOpeningStockSchema } from "@/lib/schemas/product";
import { adminRoute, parseBody } from "@/server/http";
import { setOpeningStock } from "@/server/products/service";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  const input = await parseBody(req, setOpeningStockSchema);
  return setOpeningStock(actor, docIdSchema.parse(params.id), input);
});
