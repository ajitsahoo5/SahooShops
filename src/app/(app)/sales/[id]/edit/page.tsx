import { notFound, redirect } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice/invoice-editor";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { COL } from "@/server/collections";
import { editorLines } from "@/server/invoices/page-helpers";
import { getInvoice } from "@/server/invoices/queries";
import { listParties } from "@/server/parties/service";
import type { SaleDoc } from "@/server/types";

export default async function EditSalePage(props: PageProps<"/sales/[id]/edit">) {
  await requireAdminPage();
  const { id } = await props.params;
  const [sale, customers] = await Promise.all([getInvoice<SaleDoc>(COL.sales, id), listParties("customer", { activeOnly: true })]);
  if (!sale) notFound();
  if (sale.status !== "draft") redirect(`/sales/${id}`);
  return (
    <>
      <PageHeader title="Edit sale draft" />
      <InvoiceEditor
        kind="sale"
        parties={customers.map((c) => ({ id: c.id, name: c.name }))}
        draft={{
          id,
          partyId: sale.customerId,
          businessDate: sale.businessDate,
          billDiscountPaise: sale.billDiscountPaise,
          notes: sale.notes,
          items: await editorLines(sale.items),
        }}
      />
    </>
  );
}
