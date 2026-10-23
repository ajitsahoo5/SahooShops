import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { listCategories } from "@/server/products/categories";
import { CategoryManager } from "@/components/category-manager";

export const metadata = { title: "Categories" };

export default async function CategoriesPage() {
  await requireAdminPage();
  const categories = await listCategories();
  return (
    <>
      <PageHeader title="Product categories" description="Group products for filtering and reports." />
      <CategoryManager categories={categories.map((c) => ({ id: c.id, name: c.name }))} endpoint="/api/categories" />
    </>
  );
}
