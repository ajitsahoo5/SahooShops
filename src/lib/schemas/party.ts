import { z } from "zod";
import { optionalText } from "./common";

export const partySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s()]*$/, "Phone can contain digits, spaces, +, - and brackets")
    .default(""),
  email: z.union([z.literal(""), z.string().trim().email().max(120)]).default(""),
  address: optionalText(300),
  notes: optionalText(500),
  active: z.boolean().default(true),
});

export type PartyInput = z.infer<typeof partySchema>;
