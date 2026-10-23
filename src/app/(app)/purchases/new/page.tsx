import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { InvoiceEditor } from "@/components/invoice/invoice-editor";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/server/auth";
import { listParties } from "@/server/parties/service";

export const metadata = { title: "New purchase" };

export default async function NewPurchasePage() {
  await requireAdminPage();
  const suppliers = await listParties("supplier", { activeOnly: true });
  return (
    <>
      <PageHeader title="New purchase" />
      {suppliers.length === 0 ? (
        <EmptyState message="Add a supplier before recording purchases.">
          <Button asChild>
            <Link href="/suppliers">Go to suppliers</Link>
          </Button>
        </EmptyState>
      ) : (
        <InvoiceEditor kind="purchase" parties={suppliers.map((s) => ({ id: s.id, name: s.name }))} />
      )}
    </>
  );
}
