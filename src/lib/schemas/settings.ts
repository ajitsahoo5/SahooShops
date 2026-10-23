import { z } from "zod";

const prefix = z
  .string()
  .trim()
  .min(1)
  .max(8)
  .regex(/^[A-Z0-9]+$/, "Use 1 to 8 capital letters or digits");

export const settingsSchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  address: z.string().trim().max(300).default(""),
  phone: z.string().trim().max(30).default(""),
  invoicePrefix: prefix,
  purchasePrefix: prefix,
  returnPrefix: prefix,
  allowNegativeStock: z.boolean(),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
