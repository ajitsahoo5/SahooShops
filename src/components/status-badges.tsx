import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, StockStatus } from "@/server/types";

const GREEN = "bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300";
const AMBER = "bg-amber-500/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200";

export function StockBadge({ status }: { status: StockStatus }) {
  if (status === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (status === "low") return <Badge className={AMBER}>Low stock</Badge>;
  return <Badge className={GREEN}>In stock</Badge>;
}

export function InvoiceStatusBadge({ status, archived }: { status: InvoiceStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {status === "draft" && <Badge className={AMBER}>Draft</Badge>}
      {status === "posted" && <Badge className={GREEN}>Posted</Badge>}
      {status === "reversed" && <Badge variant="destructive">Reversed</Badge>}
      {archived && <Badge variant="outline">Archived</Badge>}
    </span>
  );
}
