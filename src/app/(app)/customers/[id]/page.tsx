import { PartyDetailPage } from "@/components/parties/party-pages";
import { requireAdminPage } from "@/server/auth";

export default async function CustomerPage(props: PageProps<"/customers/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  return <PartyDetailPage type="customer" id={id} />;
}
