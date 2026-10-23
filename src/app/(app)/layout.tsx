import { requireAdminPage } from "@/server/auth";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const actor = await requireAdminPage();
  return <AppShell email={actor.email}>{children}</AppShell>;
}
