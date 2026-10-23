import { PartyListPage } from "@/components/parties/party-pages";
import { requireAdminPage } from "@/server/auth";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requireAdminPage();
  return <PartyListPage type="supplier" />;
}
