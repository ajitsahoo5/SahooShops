import { settingsSchema } from "@/lib/schemas/settings";
import { adminRoute, parseBody } from "@/server/http";
import { readSettings, updateSettings } from "@/server/settings";

export const GET = adminRoute(async () => readSettings());

export const PUT = adminRoute(async ({ req, actor }) => {
  await updateSettings(actor, await parseBody(req, settingsSchema));
  return { ok: true };
});
