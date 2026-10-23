import { PartyListPage } from "@/components/parties/party-pages";
import { requireAdminPage } from "@/server/auth";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  await requireAdminPage();
  return <PartyListPage type="customer" />;
}
