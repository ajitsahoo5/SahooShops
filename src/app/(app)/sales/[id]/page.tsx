import Link from "next/link";
import { notFound } from "next/navigation";
import { AmountRow, InvoiceLinesTable } from "@/components/invoice/invoice-view";
import { DraftActions, PostDraftDialog, PrintButton, ReverseDialog } from "@/components/invoice/invoice-actions";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { InvoiceStatusBadge } from "@/components/status-badges";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime, formatDisplayDate } from "@/lib/dates";
import { grossProfit } from "@/lib/invoice-math";
import { formatINR } from "@/lib/money";
import { requireAdminPage } from "@/server/auth";
import { COL } from "@/server/collections";
import { getInvoice, listInvoicePayments, listSaleReturns } from "@/server/invoices/queries";
import { readSettings } from "@/server/settings";
import type { SaleDoc } from "@/server/types";
import { ReceivePaymentDialog } from "../../payments/payment-dialogs";
import { SaleReturnDialog } from "./sale-return-dialog";

export default async function SalePage(props: PageProps<"/sales/[id]">) {
  await requireAdminPage();
  const { id } = await props.params;
  const [sale, payments, returns, settings] = await Promise.all([
    getInvoice<SaleDoc>(COL.sales, id),
    listInvoicePayments(id),
    listSaleReturns(id),
    readSettings(),
  ]);
  if (!sale) notFound();
  const profit = grossProfit({
    salesPaise: sale.totals.totalPaise,
    returnsPaise: sale.returnedPaise,
    cogsPaise: sale.costOfGoodsPaise,
    returnsCogsPaise: sale.returnedCogsPaise,
  });
  const returnable = sale.items.some((l) => l.returnedQtyMilli < l.qtyMilli);

  return (
    <>
      <div className="hidden print:block print:mb-4">
        <h2 className="text-xl font-bold">{settings.shopName}</h2>
        {settings.address && <p className="text-sm">{settings.address}</p>}
        {settings.phone && <p className="text-sm">Phone: {settings.phone}</p>}
      </div>
      <PageHeader
        title={sale.number ? `Sale ${sale.number}` : "Sale draft"}
        description={`${formatDisplayDate(sale.businessDate)} · ${sale.customerName ?? "Walk-in customer"}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {sale.status === "draft" && (
              <>
                <PostDraftDialog kind="sale" id={id} total={sale.totals.totalPaise} hasParty={Boolean(sale.customerId)} />
                <DraftActions kind="sale" id={id} />
              </>
            )}
            {sale.status === "posted" && sale.duePaise > 0 && sale.customerId && (
              <ReceivePaymentDialog
                partyType="customer"
                partyId={sale.customerId}
                invoiceId={id}
                defaultAmount={sale.duePaise}
                label="Receive payment"
              />
            )}
            {sale.status === "posted" && returnable && <SaleReturnDialog sale={{ id, items: sale.items }} hasCustomer={Boolean(sale.customerId)} />}
            {sale.status === "posted" && sale.returnedPaise === 0 && <ReverseDialog kind="sale" id={id} paidPaise={sale.paidPaise} />}
            {sale.status !== "draft" && <PrintButton />}
          </div>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <InvoiceStatusBadge status={sale.status} archived={sale.archived} />
        {sale.customerId && (
          <Link href={`/customers/${sale.customerId}`} className="text-sm text-muted-foreground hover:underline print:hidden">
            View customer
          </Link>
        )}
      </div>
      {sale.status === "reversed" && (
        <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          Reversed {sale.reversedAt ? formatDateTime(sale.reversedAt) : ""}: {sale.reversalReason}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <InvoiceLinesTable items={sale.items} totals={sale.totals} showReturns={sale.status !== "draft"} />
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Balance</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <AmountRow label="Invoice total" value={sale.totals.totalPaise} />
            {sale.returnedPaise > 0 && <AmountRow label="Returned" value={-sale.returnedPaise} />}
            <AmountRow label="Paid" value={sale.paidPaise} />
            {sale.refundedPaise > 0 && <AmountRow label="Refunded" value={-sale.refundedPaise} />}
            <AmountRow label="Balance due" value={sale.duePaise} strong />
            {sale.status !== "draft" && (
              <div className="mt-2 border-t pt-2 print:hidden">
                <AmountRow label="Cost of goods" value={sale.costOfGoodsPaise - sale.returnedCogsPaise} />
                <AmountRow label="Gross profit" value={sale.status === "reversed" ? 0 : profit} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {sale.notes && <p className="mt-4 text-sm text-muted-foreground">Notes: {sale.notes}</p>}

      {returns.length > 0 && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-2 text-lg font-semibold">Returns</h2>
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-indigo-950/[0.04]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Refund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDisplayDate(r.businessDate)}</TableCell>
                    <TableCell>{r.number}</TableCell>
                    <TableCell className="text-xs">{r.items.map((i) => i.name).join(", ")}</TableCell>
                    <TableCell className="text-xs">{r.reason}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.totalPaise)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatINR(r.refundPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {sale.status !== "draft" && (
        <section className="mt-6 print:hidden">
          <h2 className="mb-2 text-lg font-semibold">Payments</h2>
          <PaymentsTable payments={payments} showParty={false} />
        </section>
      )}
    </>
  );
}
