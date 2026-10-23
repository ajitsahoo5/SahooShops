import { partySchema } from "@/lib/schemas/party";
import { adminRoute, parseBody } from "@/server/http";
import { createParty, listParties } from "@/server/parties/service";

export const GET = adminRoute(async () => ({ items: await listParties("supplier") }));

export const POST = adminRoute(async ({ req, actor }) => {
  return createParty(actor, "supplier", await parseBody(req, partySchema));
});
