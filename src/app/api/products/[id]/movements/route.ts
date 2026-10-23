import { docIdSchema } from "@/lib/schemas/common";
import { adminRoute } from "@/server/http";
import { listProductMovements } from "@/server/products/service";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  return { items: await listProductMovements(docIdSchema.parse(params.id)) };
});
