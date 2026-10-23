import { z } from "zod";
import {
  businessDateSchema,
  docIdSchema,
  idempotencyKeySchema,
  optionalText,
  paymentMethodSchema,
  positivePaiseSchema,
  positiveQtySchema,
  reasonSchema,
} from "./common";

export const recordPaymentSchema = z.object({
  partyType: z.enum(["customer", "supplier"]),
  partyId: docIdSchema,
  method: paymentMethodSchema,
  amountPaise: positivePaiseSchema,
  businessDate: businessDateSchema,
  /** When omitted, the amount is applied to the oldest open invoices first. */
  invoiceId: docIdSchema.nullable().default(null),
  notes: optionalText(300),
  idempotencyKey: idempotencyKeySchema,
});

export const reversePaymentSchema = z.object({
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const saleReturnSchema = z.object({
  businessDate: businessDateSchema,
  items: z
    .array(z.object({ lineIndex: z.number().int().min(0).max(199), qtyMilli: positiveQtySchema }))
    .min(1, "Choose at least one item to return")
    .max(200),
  refundMethod: paymentMethodSchema.default("cash"),
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const paymentListQuerySchema = z.object({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  method: paymentMethodSchema.optional(),
  kind: z.enum(["receipt", "payment", "refund", "reversal"]).optional(),
});

export const expenseSchema = z.object({
  categoryId: docIdSchema,
  businessDate: businessDateSchema,
  amountPaise: positivePaiseSchema,
  method: paymentMethodSchema,
  description: optionalText(300),
  idempotencyKey: idempotencyKeySchema,
});

export const voidExpenseSchema = z.object({ reason: reasonSchema });

export const expenseListQuerySchema = z.object({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  categoryId: docIdSchema.optional(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type SaleReturnInput = z.infer<typeof saleReturnSchema>;
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;
export type ExpenseInput = z.infer<typeof expenseSchema>;
export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
