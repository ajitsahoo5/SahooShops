import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, StockStatus } from "@/server/types";

export function StockBadge({ status }: { status: StockStatus }) {
  if (status === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (status === "low") return <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Low stock</Badge>;
  return <Badge variant="secondary">In stock</Badge>;
}

export function InvoiceStatusBadge({ status, archived }: { status: InvoiceStatus; archived?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {status === "draft" && <Badge variant="outline">Draft</Badge>}
      {status === "posted" && <Badge variant="secondary">Posted</Badge>}
      {status === "reversed" && <Badge variant="destructive">Reversed</Badge>}
      {archived && <Badge variant="outline">Archived</Badge>}
    </span>
  );
}
