import Form from "next/form";
import Link from "next/link";
import { MOVEMENT_LABELS, MovementTable } from "@/components/movement-table";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isBusinessDate } from "@/lib/dates";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { listMovements } from "@/server/inventory/ledger";
import { getProduct } from "@/server/products/service";
import type { StockMovementType } from "@/server/types";

export const metadata = { title: "Stock ledger" };

export default async function StockPage(props: PageProps<"/stock">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const productId = param(sp, "productId");
  const typeParam = param(sp, "type");
  const type = typeParam && typeParam in MOVEMENT_LABELS ? (typeParam as StockMovementType) : undefined;
  const from = param(sp, "from");
  const to = param(sp, "to");
  const [movements, product] = await Promise.all([
    listMovements({
      productId,
      type,
      from: from && isBusinessDate(from) ? from : undefined,
      to: to && isBusinessDate(to) ? to : undefined,
    }),
    productId ? getProduct(productId) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHeader
        title="Stock ledger"
        description="Every change to stock quantity and value, newest first. Adjust stock from a product page."
      />
      <Form action="/stock" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm shadow-indigo-950/[0.04]">
        {productId && <input type="hidden" name="productId" value={productId} />}
        <NativeSelect name="type" defaultValue={type ?? ""} className="w-44" aria-label="Movement type">
          <option value="">All types</option>
          {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={from ?? ""} className="w-40" aria-label="From" />
        <Input type="date" name="to" defaultValue={to ?? ""} className="w-40" aria-label="To" />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>
      {product && (
        <p className="mb-3 text-sm">
          Showing movements for <strong>{product.name}</strong> ({product.sku}).{" "}
          <Link href="/stock" className="text-muted-foreground hover:underline">
            Show all products
          </Link>
        </p>
      )}
      <MovementTable movements={movements} />
    </>
  );
}
