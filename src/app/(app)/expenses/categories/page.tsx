import { CategoryManager } from "@/components/category-manager";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { listExpenseCategories } from "@/server/expenses/service";

export const metadata = { title: "Expense categories" };

export default async function ExpenseCategoriesPage() {
  await requireAdminPage();
  const categories = await listExpenseCategories();
  return (
    <>
      <PageHeader title="Expense categories" description="For example rent, electricity, salaries, transport." />
      <CategoryManager categories={categories.map((c) => ({ id: c.id, name: c.name }))} endpoint="/api/expense-categories" />
    </>
  );
}
