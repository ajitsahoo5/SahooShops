import { DomainError } from "@/lib/errors";
import { docIdSchema } from "@/lib/schemas/common";
import { updateProductSchema } from "@/lib/schemas/product";
import { adminRoute, parseBody } from "@/server/http";
import { deleteProduct, getProduct, updateProduct } from "@/server/products/service";
import { toProductView } from "@/server/products/view";

export const GET = adminRoute<{ id: string }>(async ({ params }) => {
  const product = await getProduct(docIdSchema.parse(params.id));
  if (!product) throw new DomainError("NOT_FOUND", "Product not found.");
  return toProductView(product);
});

export const PUT = adminRoute<{ id: string }>(async ({ req, actor, params }) => {
  const input = await parseBody(req, updateProductSchema);
  await updateProduct(actor, docIdSchema.parse(params.id), input);
  return { ok: true };
});

export const DELETE = adminRoute<{ id: string }>(async ({ actor, params }) => {
  await deleteProduct(actor, docIdSchema.parse(params.id));
  return { ok: true };
});
