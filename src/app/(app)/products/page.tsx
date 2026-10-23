import Form from "next/form";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { StockBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { productListQuerySchema } from "@/lib/schemas/product";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { averageUnitCost } from "@/server/inventory/costing";
import { listCategories } from "@/server/products/categories";
import { listProducts } from "@/server/products/service";
import { ProductFormDialog } from "./product-form-dialog";

export const metadata = { title: "Products" };

export default async function ProductsPage(props: PageProps<"/products">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const parsed = productListQuerySchema.safeParse({
    q: param(sp, "q"),
    categoryId: param(sp, "categoryId"),
    status: param(sp, "status"),
    active: param(sp, "active"),
  });
  const filters = parsed.success ? parsed.data : { active: "active" as const };
  const [{ items, truncated }, categories] = await Promise.all([listProducts(filters), listCategories()]);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage products, prices, and stock levels."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/products/categories">Categories</Link>
            </Button>
            <ProductFormDialog categories={categoryOptions} />
          </>
        }
      />
      <Form action="/products" className="mb-4 flex flex-wrap items-end gap-2">
        <Input name="q" placeholder="Search name or SKU" defaultValue={filters.q ?? ""} className="w-56" />
        <NativeSelect name="categoryId" defaultValue={filters.categoryId ?? ""} className="w-44" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filters.status ?? ""} className="w-36" aria-label="Stock status">
          <option value="">Any stock</option>
          <option value="ok">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </NativeSelect>
        <NativeSelect name="active" defaultValue={filters.active} className="w-32" aria-label="Active">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>

      {items.length === 0 ? (
        <EmptyState message="No products match these filters." />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Avg cost</TableHead>
                <TableHead className="text-right">Selling price</TableHead>
                <TableHead className="text-right">Stock value</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <Link href={`/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </TableCell>
                  <TableCell>{p.categoryId ? categoryName.get(p.categoryId) ?? "-" : "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatQty(p.stockQtyMilli)} {p.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(
                      averageUnitCost({
                        qtyMilli: p.stockQtyMilli,
                        valuePaise: p.stockValuePaise,
                        lastCostPaise: p.purchaseCostPaise,
                      }),
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(p.sellingPricePaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(p.stockValuePaise)}</TableCell>
                  <TableCell>
                    <StockBadge status={p.stockStatus} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {truncated && (
        <p className="mt-2 text-xs text-muted-foreground">Showing the first 500 products. Narrow the filters to see more.</p>
      )}
    </>
  );
}
