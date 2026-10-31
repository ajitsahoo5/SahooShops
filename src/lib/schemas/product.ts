import { z } from "zod";
import {
  businessDateSchema,
  docIdSchema,
  idempotencyKeySchema,
  paiseSchema,
  positiveQtySchema,
  qtyMilliSchema,
  reasonSchema,
} from "./common";

export const UNIT_SUGGESTIONS = ["pcs", "kg", "g", "l", "ml", "box", "pack", "dozen", "m", "pair", "set"];

export const skuSchema = z
  .string()
  .trim()
  .min(1, "SKU is required")
  .max(40)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Use letters, digits, dot, dash or underscore")
  .transform((s) => s.toUpperCase());

export const productFieldsSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1, "Name is required").max(120),
  categoryId: docIdSchema.nullable(),
  unit: z.string().trim().min(1, "Unit is required").max(20),
  purchaseCostPaise: paiseSchema,
  sellingPricePaise: paiseSchema,
  reorderLevelMilli: qtyMilliSchema,
  active: z.boolean().default(true),
});

export const openingStockSchema = z.object({
  qtyMilli: positiveQtySchema,
  unitCostPaise: paiseSchema,
  businessDate: businessDateSchema,
});

export const createProductSchema = productFieldsSchema.extend({
  openingStock: openingStockSchema.nullable().default(null),
  idempotencyKey: idempotencyKeySchema,
});

export const updateProductSchema = productFieldsSchema;

export const setOpeningStockSchema = openingStockSchema.extend({ idempotencyKey: idempotencyKeySchema });

export const productListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  categoryId: docIdSchema.optional(),
  status: z.enum(["ok", "low", "out"]).optional(),
  active: z.enum(["active", "inactive", "all"]).default("active"),
  sort: z.enum(["name", "sku"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});

export const stockAdjustmentSchema = z
  .object({
    productId: docIdSchema,
    direction: z.enum(["in", "out"]),
    qtyMilli: positiveQtySchema,
    /** Optional for stock in; defaults to the current average cost. */
    unitCostPaise: paiseSchema.nullable().default(null),
    reason: reasonSchema,
    businessDate: businessDateSchema,
    idempotencyKey: idempotencyKeySchema,
  });

export const categorySchema = z.object({ name: z.string().trim().min(1).max(60) });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductListQuery = z.infer<typeof productListQuerySchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
