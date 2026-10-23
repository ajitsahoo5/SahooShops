import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { docIdSchema } from "@/lib/schemas/common";
import { cancelArchive, commitArchive, generateArchive, verifyArchive } from "@/server/archive/service";
import { adminRoute, parseBody } from "@/server/http";

export const runtime = "nodejs";
export const maxDuration = 120;

const commitSchema = z.object({ confirmBatchId: z.string().trim().min(1).max(128) });

export const POST = adminRoute<{ id: string; action: string }>(async ({ req, actor, params }) => {
  const id = docIdSchema.parse(params.id);
  switch (params.action) {
    case "generate": {
      const batch = await generateArchive(actor, id);
      return { status: batch.status };
    }
    case "verify": {
      const batch = await verifyArchive(actor, id);
      return { status: batch.status };
    }
    case "commit": {
      const { confirmBatchId } = await parseBody(req, commitSchema);
      return commitArchive(actor, id, confirmBatchId);
    }
    case "cancel":
      await cancelArchive(actor, id);
      return { ok: true };
    default:
      throw new DomainError("NOT_FOUND", "Unknown archive action.");
  }
});
