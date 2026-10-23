import Form from "next/form";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { PaymentsTable } from "@/components/payments-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatINR } from "@/lib/money";
import { paymentListQuerySchema } from "@/lib/schemas/payment";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { listParties } from "@/server/parties/service";
import { listPayments } from "@/server/payments/service";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/server/types";
import { RecordPaymentDialog, ReversePaymentButton } from "./payment-dialogs";

export const metadata = { title: "Payments" };

export default async function PaymentsPage(props: PageProps<"/payments">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  const parsed = paymentListQuerySchema.safeParse({
    from: param(sp, "from"),
    to: param(sp, "to"),
    method: param(sp, "method"),
    kind: param(sp, "kind"),
  });
  const filters = parsed.success ? parsed.data : {};
  const [payments, customers, suppliers] = await Promise.all([
    listPayments(filters),
    listParties("customer", { withBalanceOnly: true }),
    listParties("supplier", { withBalanceOnly: true }),
  ]);
  const counted = payments.filter((p) => p.status === "active" && p.kind !== "reversal");
  const moneyIn = counted.filter((p) => p.direction === "in").reduce((s, p) => s + p.amountPaise, 0);
  const moneyOut = counted.filter((p) => p.direction === "out").reduce((s, p) => s + p.amountPaise, 0);
  const pick = (p: { id: string; name: string; balancePaise: number }) => ({ id: p.id, name: p.name, balancePaise: p.balancePaise });

  return (
    <>
      <PageHeader
        title="Payments"
        description={`Money in ${formatINR(moneyIn)} · money out ${formatINR(moneyOut)} (excluding reversed entries)`}
        actions={<RecordPaymentDialog customers={customers.map(pick)} suppliers={suppliers.map(pick)} />}
      />
      <Form action="/payments" className="mb-4 flex flex-wrap items-end gap-2">
        <Input type="date" name="from" defaultValue={filters.from ?? ""} className="w-40" aria-label="From" />
        <Input type="date" name="to" defaultValue={filters.to ?? ""} className="w-40" aria-label="To" />
        <NativeSelect name="method" defaultValue={filters.method ?? ""} className="w-36" aria-label="Method">
          <option value="">All methods</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABELS[m]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="kind" defaultValue={filters.kind ?? ""} className="w-36" aria-label="Type">
          <option value="">All types</option>
          <option value="receipt">Received</option>
          <option value="payment">Paid</option>
          <option value="refund">Refunds</option>
          <option value="reversal">Reversals</option>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>
      <PaymentsTable
        payments={payments}
        actions={(p) =>
          p.status === "active" && p.partyId && (p.kind === "receipt" || p.kind === "payment") ? (
            <ReversePaymentButton paymentId={p.id} />
          ) : null
        }
      />
    </>
  );
}
