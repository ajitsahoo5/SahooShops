import { PartyDetailPage } from "@/components/parties/party-pages";
import { requireAdminPage } from "@/server/auth";

export default async function SupplierPage(props: PageProps<"/suppliers/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  return <PartyDetailPage type="supplier" id={id} />;
}
