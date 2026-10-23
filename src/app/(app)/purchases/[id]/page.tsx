import Link from "next/link";
import { notFound } from "next/navigation";
import { DraftActions, PostDraftDialog, PrintButton, ReverseDialog } from "@/components/invoice/invoice-actions";
import { AmountRow, InvoiceLinesTable } from "@/components/invoice/invoice-view";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { InvoiceStatusBadge } from "@/components/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime, formatDisplayDate } from "@/lib/dates";
import { requireAdminPage } from "@/server/auth";
import { COL } from "@/server/collections";
import { getInvoice, listInvoicePayments } from "@/server/invoices/queries";
import type { PurchaseDoc } from "@/server/types";
import { ReceivePaymentDialog } from "../../payments/payment-dialogs";

export default async function PurchasePage(props: PageProps<"/purchases/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  const [purchase, payments] = await Promise.all([getInvoice<PurchaseDoc>(COL.purchases, id), listInvoicePayments(id)]);
  if (!purchase) notFound();

  return (
    <>
      <PageHeader
        title={purchase.number ? `Purchase ${purchase.number}` : "Purchase draft"}
        description={`${formatDisplayDate(purchase.businessDate)} · ${purchase.supplierName}${
          purchase.supplierInvoiceNo ? ` · bill ${purchase.supplierInvoiceNo}` : ""
        }`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {purchase.status === "draft" && (
              <>
                <PostDraftDialog kind="purchase" id={id} total={purchase.totals.totalPaise} hasParty />
                <DraftActions kind="purchase" id={id} />
              </>
            )}
            {purchase.status === "posted" && purchase.duePaise > 0 && (
              <ReceivePaymentDialog
                partyType="supplier"
                partyId={purchase.supplierId}
                invoiceId={id}
                defaultAmount={purchase.duePaise}
                label="Pay supplier"
              />
            )}
            {purchase.status === "posted" && <ReverseDialog kind="purchase" id={id} paidPaise={purchase.paidPaise} />}
            {purchase.status !== "draft" && <PrintButton />}
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <InvoiceStatusBadge status={purchase.status} archived={purchase.archived} />
        <Link href={`/suppliers/${purchase.supplierId}`} className="text-sm text-muted-foreground hover:underline print:hidden">
          View supplier
        </Link>
      </div>
      {purchase.status === "reversed" && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Reversed {purchase.reversedAt ? formatDateTime(purchase.reversedAt) : ""}: {purchase.reversalReason}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <InvoiceLinesTable items={purchase.items} totals={purchase.totals} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <AmountRow label="Purchase total" value={purchase.totals.totalPaise} />
            <AmountRow label="Paid" value={purchase.paidPaise} />
            {purchase.refundedPaise > 0 && <AmountRow label="Refunded by supplier" value={-purchase.refundedPaise} />}
            <AmountRow label="Balance due" value={purchase.duePaise} strong />
          </CardContent>
        </Card>
      </div>
      {purchase.notes && <p className="mt-4 text-sm text-muted-foreground">Notes: {purchase.notes}</p>}
      {purchase.status !== "draft" && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-2 text-lg font-semibold">Payments</h2>
          <PaymentsTable payments={payments} showParty={false} />
        </section>
      )}
    </>
  );
}
