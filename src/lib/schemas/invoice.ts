import { z } from "zod";
import {
  businessDateSchema,
  docIdSchema,
  idempotencyKeySchema,
  optionalText,
  paiseSchema,
  paymentMethodSchema,
  positiveQtySchema,
  reasonSchema,
} from "./common";

export const lineInputSchema = z.object({
  productId: docIdSchema,
  qtyMilli: positiveQtySchema,
  unitPricePaise: paiseSchema,
  discountPaise: paiseSchema.default(0),
});

const invoiceBase = {
  businessDate: businessDateSchema,
  items: z.array(lineInputSchema).min(1, "Add at least one item").max(200),
  billDiscountPaise: paiseSchema.default(0),
  notes: optionalText(500),
};

export const saleDraftSchema = z.object({
  ...invoiceBase,
  customerId: docIdSchema.nullable().default(null),
});

export const purchaseDraftSchema = z.object({
  ...invoiceBase,
  supplierId: docIdSchema,
  supplierInvoiceNo: optionalText(60),
});

/** Money paid at the time of posting. The rest stays on credit as a receivable or payable. */
export const initialPaymentSchema = z
  .object({ method: paymentMethodSchema, amountPaise: paiseSchema })
  .nullable()
  .default(null);

export const createSaleSchema = saleDraftSchema.extend({
  action: z.enum(["draft", "post"]),
  payment: initialPaymentSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const createPurchaseSchema = purchaseDraftSchema.extend({
  action: z.enum(["draft", "post"]),
  payment: initialPaymentSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const postDraftSchema = z.object({
  payment: initialPaymentSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const reverseInvoiceSchema = z.object({
  reason: reasonSchema,
  refundMethod: paymentMethodSchema.default("cash"),
  idempotencyKey: idempotencyKeySchema,
});

export const invoiceListQuerySchema = z.object({
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  status: z.enum(["draft", "posted", "reversed"]).optional(),
  partyId: docIdSchema.optional(),
  number: z.string().trim().max(40).optional(),
  includeArchived: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

export type SaleDraftInput = z.infer<typeof saleDraftSchema>;
export type PurchaseDraftInput = z.infer<typeof purchaseDraftSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;
export type InitialPayment = z.infer<typeof initialPaymentSchema>;
export type ReverseInvoiceInput = z.infer<typeof reverseInvoiceSchema>;
export type InvoiceListQuery = z.infer<typeof invoiceListQuerySchema>;
