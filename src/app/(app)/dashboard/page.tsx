import { addDays, businessDate, isBusinessDate, startOfMonth } from "@/lib/dates";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { getDashboard } from "@/server/dashboard";
import { DashboardView } from "./dashboard-view";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const today = businessDate();
  const preset = param(sp, "preset") ?? "month";
  let from = startOfMonth(today);
  let to = today;
  if (preset === "today") from = today;
  if (preset === "7d") from = addDays(today, -6);
  if (preset === "custom") {
    const f = param(sp, "from");
    const t = param(sp, "to");
    if (f && t && isBusinessDate(f) && isBusinessDate(t) && f <= t) {
      from = f;
      to = t;
    }
  }
  const d = await getDashboard({ from, to });
  return <DashboardView d={d} preset={preset} />;
}
