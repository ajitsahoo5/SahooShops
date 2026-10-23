import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { InvoiceFilters, InvoiceTable } from "@/components/invoice/invoice-list";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/server/auth";
import { COL } from "@/server/collections";
import { parseInvoiceFilters } from "@/server/invoices/page-helpers";
import { listInvoices } from "@/server/invoices/queries";
import { listParties } from "@/server/parties/service";
import type { PurchaseDoc } from "@/server/types";

export const metadata = { title: "Purchases" };

export default async function PurchasesPage(props: PageProps<"/purchases">) {
  await requireAdminPage();
  const filters = parseInvoiceFilters(await props.searchParams);
  const [rows, suppliers] = await Promise.all([listInvoices<PurchaseDoc>(COL.purchases, filters), listParties("supplier")]);
  return (
    <>
      <PageHeader
        title="Purchases"
        description="Stock purchased from suppliers, newest first."
        actions={
          <Button asChild>
            <Link href="/purchases/new">
              <PlusIcon /> New purchase
            </Link>
          </Button>
        }
      />
      <InvoiceFilters
        path="/purchases"
        filters={filters}
        parties={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        partyLabel="Supplier"
      />
      <InvoiceTable rows={rows} path="/purchases" partyLabel="Supplier" />
    </>
  );
}
