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
import type { SaleDoc } from "@/server/types";

export const metadata = { title: "Sales" };

export default async function SalesPage(props: PageProps<"/sales">) {
  await requireAdminPage();
  const filters = parseInvoiceFilters(await props.searchParams);
  const [rows, customers] = await Promise.all([listInvoices<SaleDoc>(COL.sales, filters), listParties("customer")]);
  return (
    <>
      <PageHeader
        title="Sales"
        description="Sales invoices, newest first. Archived invoices are hidden unless included."
        actions={
          <Button asChild>
            <Link href="/sales/new">
              <PlusIcon /> New sale
            </Link>
          </Button>
        }
      />
      <InvoiceFilters path="/sales" filters={filters} parties={customers.map((c) => ({ id: c.id, name: c.name }))} partyLabel="Customer" />
      <InvoiceTable rows={rows} path="/sales" partyLabel="Customer" />
    </>
  );
}
