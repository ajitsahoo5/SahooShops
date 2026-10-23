import type { ProductDoc, WithId } from "../types";

export type ProductView = Omit<WithId<ProductDoc>, "searchTokens" | "skuKey" | "nameLower">;

export function toProductView(p: WithId<ProductDoc>): ProductView {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { searchTokens, skuKey, nameLower, ...rest } = p;
  return rest;
}
