import { PageHeader } from "@/components/page-header";
import { requireAdminPage } from "@/server/auth";
import { readSettings } from "@/server/settings";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const actor = await requireAdminPage();
  const settings = await readSettings();
  return (
    <>
      <PageHeader title="Settings" description={`Signed in as ${actor.email}.`} />
      <SettingsForm
        initial={{
          shopName: settings.shopName,
          address: settings.address,
          phone: settings.phone,
          invoicePrefix: settings.invoicePrefix,
          purchasePrefix: settings.purchasePrefix,
          returnPrefix: settings.returnPrefix,
          allowNegativeStock: settings.allowNegativeStock,
        }}
      />
    </>
  );
}
