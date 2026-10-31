import Form from "next/form";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { StockBadge } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { productListQuerySchema, type ProductListQuery } from "@/lib/schemas/product";
import { param } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { requireAdminPage } from "@/server/auth";
import { averageUnitCost } from "@/server/inventory/costing";
import { listCategories } from "@/server/products/categories";
import { listProducts } from "@/server/products/service";
import { ProductFormDialog } from "./product-form-dialog";

type SortField = ProductListQuery["sort"];
type SortDir = ProductListQuery["dir"];

function productListHref(filters: ProductListQuery, sort: SortField, dir: SortDir) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.status) params.set("status", filters.status);
  if (filters.active !== "active") params.set("active", filters.active);
  if (sort !== "name") params.set("sort", sort);
  if (dir !== "asc") params.set("dir", dir);
  const qs = params.toString();
  return qs ? `/products?${qs}` : "/products";
}

function SortHeader({ label, field, filters }: { label: string; field: SortField; filters: ProductListQuery }) {
  const arrows: { dir: SortDir; icon: typeof ArrowUpIcon; name: string }[] = [
    { dir: "asc", icon: ArrowUpIcon, name: "ascending" },
    { dir: "desc", icon: ArrowDownIcon, name: "descending" },
  ];
  return (
    <TableHead>
      <span className="inline-flex items-center gap-1">
        {label}
        <span className="inline-flex flex-col">
          {arrows.map(({ dir, icon: Icon, name }) => {
            const active = filters.sort === field && filters.dir === dir;
            return (
              <Link
                key={dir}
                href={productListHref(filters, field, dir)}
                aria-label={`Sort by ${label} ${name}`}
                aria-current={active ? "true" : undefined}
                title={`Sort ${name}`}
                className={cn(
                  "rounded-sm leading-none hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
                  active ? "text-primary" : "text-muted-foreground/35",
                )}
              >
                <Icon className="size-3" />
              </Link>
            );
          })}
        </span>
      </span>
    </TableHead>
  );
}

export const metadata = { title: "Products" };

export default async function ProductsPage(props: PageProps<"/products">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const parsed = productListQuerySchema.safeParse({
    q: param(sp, "q"),
    categoryId: param(sp, "categoryId"),
    status: param(sp, "status"),
    active: param(sp, "active"),
    sort: param(sp, "sort"),
    dir: param(sp, "dir"),
  });
  const filters = parsed.success ? parsed.data : productListQuerySchema.parse({});
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
      <Form action="/products" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3 shadow-sm shadow-indigo-950/[0.04]">
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
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>

      {items.length === 0 ? (
        <EmptyState message="No products match these filters." />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-indigo-950/[0.04]">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="SKU" field="sku" filters={filters} />
                <SortHeader label="Name" field="name" filters={filters} />
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
