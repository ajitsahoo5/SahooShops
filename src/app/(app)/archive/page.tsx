import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { addDays, businessDate, formatDateTime, formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { archiveOverview, listBatches } from "@/server/archive/service";
import { requireAdminPage } from "@/server/auth";
import type { ArchiveBatchStatus } from "@/server/types";
import { ArchiveWorkflow, StartArchiveButton } from "./archive-workflow";

export const metadata = { title: "Archive" };

const STATUS_LABEL: Record<ArchiveBatchStatus, string> = {
  pending: "Preview ready",
  generated: "File generated",
  verified: "Verified, awaiting confirmation",
  failed: "Verification failed",
  committed: "Archived",
  cancelled: "Cancelled",
};

export default async function ArchivePage() {
  await requireAdminPage();
  const [overview, batches] = await Promise.all([archiveOverview(), listBatches()]);
  const open = batches.find((b) => b.status === "pending" || b.status === "generated" || b.status === "verified" || b.status === "failed");
  const eligible = overview.eligibleSales + overview.eligiblePurchases;

  return (
    <>
      <PageHeader
        title="Transaction archive"
        description="Archive sales and purchases older than six calendar months to keep everyday lists fast. Archived records stay in Sahoo Shop and in every report."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Eligible: dated before</CardDescription>
            <CardTitle>{formatDisplayDate(overview.cutoff)}</CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Not yet archived (includes drafts)</CardDescription>
            <CardTitle>
              {overview.eligibleSales} sales · {overview.eligiblePurchases} purchases
            </CardTitle>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>What archiving changes</CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Only hides transactions from the default lists. Stock, costs, stock history, inventory value, and balances never
            change. Drafts are never archived.
          </CardContent>
        </Card>
      </div>

      {open ? (
        <ArchiveWorkflow
          batch={{
            id: open.id,
            status: open.status,
            cutoffDate: open.cutoffDate,
            saleCount: open.saleCount,
            purchaseCount: open.purchaseCount,
            salesTotalPaise: open.salesTotalPaise,
            purchasesTotalPaise: open.purchasesTotalPaise,
            fileSha256: open.fileSha256,
            failureReason: open.failureReason,
          }}
        />
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Start an archive</CardTitle>
            <CardDescription>
              {eligible > 0
                ? "Step 1 lists the eligible transactions. Nothing is changed until you confirm in the last step."
                : "There is nothing to archive right now."}
            </CardDescription>
          </CardHeader>
          {eligible > 0 && (
            <CardContent>
              <StartArchiveButton />
            </CardContent>
          )}
        </Card>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-lg font-semibold">History</h2>
        <Link
          href={`/reports?report=archived&from=${addDays(overview.cutoff, -365 * 2)}&to=${businessDate()}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          Archived transactions report
        </Link>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Batch</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Before</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Purchases</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                  No archive batches yet.
                </TableCell>
              </TableRow>
            )}
            {batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-mono text-xs">{b.id}</TableCell>
                <TableCell>{formatDateTime(b.createdAt)}</TableCell>
                <TableCell>{formatDisplayDate(b.cutoffDate)}</TableCell>
                <TableCell>
                  <Badge variant={b.status === "committed" ? "secondary" : b.status === "failed" ? "destructive" : "outline"}>
                    {STATUS_LABEL[b.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.saleCount} · {formatINR(b.salesTotalPaise)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.purchaseCount} · {formatINR(b.purchasesTotalPaise)}
                </TableCell>
                <TableCell className="text-right">
                  {b.filePath && (
                    <a href={`/api/archive/${b.id}/file`} className="text-sm hover:underline">
                      Download
                    </a>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
