import { docIdSchema } from "@/lib/schemas/common";
import { getBatch, readArchiveFile } from "@/server/archive/service";
import { adminRoute } from "@/server/http";

export const runtime = "nodejs";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const batch = await getBatch(docIdSchema.parse(params.id));
  const file = await readArchiveFile(batch);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sahoo-shop-archive-before-${batch.cutoffDate}-${batch.id}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
});
