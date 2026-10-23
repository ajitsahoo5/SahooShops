import { createArchivePreview } from "@/server/archive/service";
import { adminRoute } from "@/server/http";

export const POST = adminRoute(async ({ actor }) => {
  const batch = await createArchivePreview(actor);
  return { id: batch.id, saleCount: batch.saleCount, purchaseCount: batch.purchaseCount };
});
