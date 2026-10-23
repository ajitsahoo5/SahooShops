import { InvoiceEditor } from "@/components/invoice/invoice-editor";
import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { listParties } from "@/server/parties/service";

export const metadata = { title: "New sale" };

export default async function NewSalePage() {
  await requireAdminPage();
  const customers = await listParties("customer", { activeOnly: true });
  return (
    <>
      <PageHeader title="New sale" />
      <InvoiceEditor kind="sale" parties={customers.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
