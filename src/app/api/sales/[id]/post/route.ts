import { docIdSchema } from "@/lib/schemas/common";
import { postDraftSchema } from "@/lib/schemas/invoice";
import { adminRoute, parseBody } from "@/server/http";
import { postSaleDraft } from "@/server/sales/service";

export const POST = adminRoute<{ id: string }>(async ({ req, actor, params }) =>
  postSaleDraft(actor, docIdSchema.parse(params.id), await parseBody(req, postDraftSchema)),
);
