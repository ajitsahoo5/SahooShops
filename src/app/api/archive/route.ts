import { archiveOverview, listBatches } from "@/server/archive/service";
import { adminRoute } from "@/server/http";

export const GET = adminRoute(async () => {
  const [overview, batches] = await Promise.all([archiveOverview(), listBatches()]);
  return { overview, batches };
});
