import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { StockBadge } from "@/components/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MovementTable } from "@/components/movement-table";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { requireAdminPage } from "@/server/auth";
import { averageUnitCost } from "@/server/inventory/costing";
import { listCategories } from "@/server/products/categories";
import { getProduct, listProductMovements } from "@/server/products/service";
import { toProductView } from "@/server/products/view";
import { ProductFormDialog } from "../product-form-dialog";
import { AdjustStockDialog, DeleteProductButton, OpeningStockDialog } from "./stock-actions";

export default async function ProductPage(props: PageProps<"/products/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  const [product, categories, movements] = await Promise.all([getProduct(id), listCategories(), listProductMovements(id)]);
  if (!product) notFound();
  const view = toProductView(product);
  const avg = averageUnitCost({
    qtyMilli: product.stockQtyMilli,
    valuePaise: product.stockValuePaise,
    lastCostPaise: product.purchaseCostPaise,
  });
  const category = categories.find((c) => c.id === product.categoryId);

  const stats = [
    { label: "Stock on hand", value: `${formatQty(product.stockQtyMilli)} ${product.unit}` },
    { label: "Stock value", value: formatINR(product.stockValuePaise) },
    { label: "Average cost", value: formatINR(avg) },
    { label: "Selling price", value: formatINR(product.sellingPricePaise) },
    { label: "Last purchase cost", value: formatINR(product.purchaseCostPaise) },
    { label: "Reorder level", value: `${formatQty(product.reorderLevelMilli)} ${product.unit}` },
  ];

  return (
    <>
      <PageHeader
        title={product.name}
        description={`${product.sku} · ${category?.name ?? "No category"}${product.active ? "" : " · inactive"}`}
        actions={
          <>
            <ProductFormDialog categories={categories.map((c) => ({ id: c.id, name: c.name }))} product={view} />
            {product.hasMovements ? (
              <AdjustStockDialog productId={id} unit={product.unit} />
            ) : (
              <>
                <OpeningStockDialog productId={id} defaultCost={product.purchaseCostPaise} />
                <DeleteProductButton productId={id} />
              </>
            )}
          </>
        }
      />
      <div className="mb-2">
        <StockBadge status={product.stockStatus} />
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-lg font-semibold tabular-nums">{s.value}</CardContent>
          </Card>
        ))}
      </div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stock movements</h2>
        <Link href={`/stock?productId=${id}`} className="text-sm text-muted-foreground hover:underline">
          Open in stock ledger
        </Link>
      </div>
      <MovementTable movements={movements} showProduct={false} />
    </>
  );
}
