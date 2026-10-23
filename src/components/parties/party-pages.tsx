import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { InvoiceTable } from "@/components/invoice/invoice-list";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/money";
import { COL } from "@/server/collections";
import { listInvoices } from "@/server/invoices/queries";
import { getParty, listParties } from "@/server/parties/service";
import { listPartyPayments } from "@/server/payments/service";
import type { PartyType, PurchaseDoc, SaleDoc } from "@/server/types";
import { ReceivePaymentDialog, ReversePaymentButton } from "@/app/(app)/payments/payment-dialogs";
import { PartyFormDialog } from "./party-form-dialog";

const LABELS = {
  customer: { plural: "Customers", path: "/customers", balance: "Receivable", invoices: "Sales" },
  supplier: { plural: "Suppliers", path: "/suppliers", balance: "Payable", invoices: "Purchases" },
} as const;

export async function PartyListPage({ type }: { type: PartyType }) {
  const labels = LABELS[type];
  const parties = await listParties(type);
  const total = parties.reduce((s, p) => s + p.balancePaise, 0);
  return (
    <>
      <PageHeader
        title={labels.plural}
        description={`Total ${labels.balance.toLowerCase()}: ${formatINR(total)}`}
        actions={<PartyFormDialog type={type} />}
      />
      {parties.length === 0 ? (
        <EmptyState message={`No ${labels.plural.toLowerCase()} yet.`} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">{labels.balance}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parties.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Link href={`${labels.path}/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    {!p.active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </TableCell>
                  <TableCell>{p.phone || "-"}</TableCell>
                  <TableCell>{p.email || "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(p.balancePaise)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

export async function PartyDetailPage({ type, id }: { type: PartyType; id: string }) {
  const labels = LABELS[type];
  const party = await getParty(type, id);
  if (!party) notFound();
  const [invoices, payments] = await Promise.all([
    type === "customer"
      ? listInvoices<SaleDoc>(COL.sales, { partyId: id, includeArchived: true, limit: 100 })
      : listInvoices<PurchaseDoc>(COL.purchases, { partyId: id, includeArchived: true, limit: 100 }),
    listPartyPayments(id),
  ]);

  return (
    <>
      <PageHeader
        title={party.name}
        description={[party.phone, party.email].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {party.balancePaise > 0 && (
              <ReceivePaymentDialog
                partyType={type}
                partyId={id}
                defaultAmount={party.balancePaise}
                label={type === "customer" ? "Receive payment" : "Pay supplier"}
              />
            )}
            <PartyFormDialog type={type} party={party} />
          </>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs font-normal text-muted-foreground">{labels.balance}</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold tabular-nums">{formatINR(party.balancePaise)}</CardContent>
        </Card>
        {party.address && (
          <Card size="sm" className="sm:col-span-2">
            <CardHeader>
              <CardTitle className="text-xs font-normal text-muted-foreground">Address</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-line">{party.address}</CardContent>
          </Card>
        )}
      </div>
      <h2 className="mb-2 text-lg font-semibold">{labels.invoices}</h2>
      <InvoiceTable rows={invoices} path={type === "customer" ? "/sales" : "/purchases"} partyLabel={type === "customer" ? "Customer" : "Supplier"} />
      <h2 className="mt-6 mb-2 text-lg font-semibold">Payments</h2>
      <PaymentsTable
        payments={payments}
        showParty={false}
        actions={(p) =>
          p.status === "active" && (p.kind === "receipt" || p.kind === "payment") ? <ReversePaymentButton paymentId={p.id} /> : null
        }
      />
    </>
  );
}
