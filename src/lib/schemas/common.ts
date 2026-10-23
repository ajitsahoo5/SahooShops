import { z } from "zod";
import { isBusinessDate } from "../dates";
import { PAYMENT_METHODS } from "@/server/types";

const MAX_PAISE = 1_000_000_000_000; // ₹1,000 crore
const MAX_QTY_MILLI = 1_000_000_000_000;

export const paiseSchema = z.number().int("Amount must be in whole paise").min(0).max(MAX_PAISE);
export const positivePaiseSchema = paiseSchema.min(1, "Amount must be greater than zero");
export const qtyMilliSchema = z.number().int().min(0).max(MAX_QTY_MILLI);
export const positiveQtySchema = qtyMilliSchema.min(1, "Quantity must be greater than zero");
export const businessDateSchema = z.string().refine(isBusinessDate, "Invalid date (use YYYY-MM-DD)");
export const docIdSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/, "Invalid id");
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{8,100}$/, "Invalid idempotency key");
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export const reasonSchema = z.string().trim().min(3, "Please give a reason").max(500);
export const optionalText = (max: number) => z.string().trim().max(max).default("");

export const dateRangeQuerySchema = z
  .object({
    from: businessDateSchema,
    to: businessDateSchema,
  })
  .refine((r) => r.from <= r.to, { message: "Start date must be on or before end date", path: ["from"] });
