import { notFound, redirect } from "next/navigation";
import { InvoiceEditor } from "@/components/invoice/invoice-editor";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { COL } from "@/server/collections";
import { editorLines } from "@/server/invoices/page-helpers";
import { getInvoice } from "@/server/invoices/queries";
import { listParties } from "@/server/parties/service";
import type { PurchaseDoc } from "@/server/types";

export default async function EditPurchasePage(props: PageProps<"/purchases/[id]/edit">) {
  await requireAdminPage();
  const { id } = await props.params;
  const [purchase, suppliers] = await Promise.all([
    getInvoice<PurchaseDoc>(COL.purchases, id),
    listParties("supplier", { activeOnly: true }),
  ]);
  if (!purchase) notFound();
  if (purchase.status !== "draft") redirect(`/purchases/${id}`);
  return (
    <>
      <PageHeader title="Edit purchase draft" />
      <InvoiceEditor
        kind="purchase"
        parties={suppliers.map((s) => ({ id: s.id, name: s.name }))}
        draft={{
          id,
          partyId: purchase.supplierId,
          businessDate: purchase.businessDate,
          supplierInvoiceNo: purchase.supplierInvoiceNo,
          billDiscountPaise: purchase.billDiscountPaise,
          notes: purchase.notes,
          items: await editorLines(purchase.items),
        }}
      />
    </>
  );
}
