import { DomainError } from "@/lib/errors";
import { docIdSchema } from "@/lib/schemas/common";
import { partySchema } from "@/lib/schemas/party";
import { adminRoute, parseBody } from "@/server/http";
import { getParty, updateParty } from "@/server/parties/service";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const party = await getParty("customer", docIdSchema.parse(params.id));
  if (!party) throw new DomainError("NOT_FOUND", "Customer not found.");
  return party;
});

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  await updateParty(actor, "customer", docIdSchema.parse(params.id), await parseBody(req, partySchema));
  return { ok: true };
});
