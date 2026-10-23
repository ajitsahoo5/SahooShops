import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import type { SettingsInput } from "@/lib/schemas/settings";
import type { Actor } from "./auth";
import { writeAudit } from "./audit";
import { COL, col, nowIso } from "./collections";
import { db } from "./firebaseAdmin";
import type { ShopSettings } from "./types";

export const DEFAULT_SETTINGS: ShopSettings = {
  shopName: "Sahoo Shop",
  address: "",
  phone: "",
  invoicePrefix: "INV",
  purchasePrefix: "PUR",
  returnPrefix: "RET",
  allowNegativeStock: false,
};

export function settingsRef() {
  return col(COL.settings).doc("shop");
}

export async function readSettings(tx?: Transaction): Promise<ShopSettings> {
  const ref = settingsRef();
  const snap = tx ? await tx.get(ref) : await ref.get();
  return { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<ShopSettings> | undefined) };
}

export async function updateSettings(actor: Actor, input: SettingsInput): Promise<void> {
  await db().runTransaction(async (tx) => {
    const before = await readSettings(tx);
    tx.set(settingsRef(), { ...input, updatedAt: nowIso() } satisfies ShopSettings);
    const changed = (Object.keys(input) as (keyof SettingsInput)[]).filter((k) => before[k] !== input[k]);
    writeAudit(tx, actor, "settings.update", "settings", "shop", `Updated settings: ${changed.join(", ") || "no changes"}`, {
      before: Object.fromEntries(changed.map((k) => [k, before[k]])),
      after: Object.fromEntries(changed.map((k) => [k, input[k]])),
    });
  });
}
