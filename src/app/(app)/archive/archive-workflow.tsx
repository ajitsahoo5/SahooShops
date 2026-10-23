"use client";

import { useState } from "react";
import { CheckCircle2Icon, CircleIcon, XCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api-client";
import { formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import type { ArchiveBatchStatus } from "@/server/types";

type BatchView = {
  id: string;
  status: ArchiveBatchStatus;
  cutoffDate: string;
  saleCount: number;
  purchaseCount: number;
  salesTotalPaise: number;
  purchasesTotalPaise: number;
  fileSha256: string | null;
  failureReason: string | null;
};

export function StartArchiveButton() {
  const { pending, run } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => api("/api/archive/preview", "POST"), { success: "Preview created" })}>
      {pending ? "Checking..." : "Find eligible transactions"}
    </Button>
  );
}

function Step({ done, failed, title, children }: { done: boolean; failed?: boolean; title: string; children?: React.ReactNode }) {
  const Icon = failed ? XCircleIcon : done ? CheckCircle2Icon : CircleIcon;
  return (
    <li className="flex gap-3">
      <Icon className={`mt-0.5 size-5 shrink-0 ${failed ? "text-destructive" : done ? "text-emerald-600" : "text-muted-foreground"}`} />
      <div className="flex-1">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

export function ArchiveWorkflow({ batch }: { batch: BatchView }) {
  const { pending, run } = useAction();
  const [confirm, setConfirm] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const generated = batch.status === "generated" || batch.status === "verified";
  const verified = batch.status === "verified";

  async function generateAndVerify() {
    await run(
      async () => {
        await api(`/api/archive/${batch.id}/generate`, "POST");
        await api(`/api/archive/${batch.id}/verify`, "POST");
      },
      { success: "Archive file generated and verified" },
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Archive batch {batch.id}</CardTitle>
        <CardDescription>
          {batch.saleCount} sales ({formatINR(batch.salesTotalPaise)}) and {batch.purchaseCount} purchases (
          {formatINR(batch.purchasesTotalPaise)}) dated before {formatDisplayDate(batch.cutoffDate)}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-4 text-sm">
          <Step done title="1. Eligible transactions identified" />
          <Step
            done={generated}
            failed={batch.status === "failed"}
            title="2. Generate the Excel archive and verify it against Sahoo Shop records"
          >
            {batch.status === "failed" && (
              <p className="mt-1 text-destructive">Verification failed: {batch.failureReason}. Nothing was archived.</p>
            )}
            {(batch.status === "pending" || batch.status === "failed") && (
              <Button className="mt-2" disabled={pending} onClick={generateAndVerify}>
                {pending ? "Working..." : batch.status === "failed" ? "Try again" : "Generate and verify"}
              </Button>
            )}
            {batch.status === "generated" && (
              <Button
                className="mt-2"
                disabled={pending}
                onClick={() => run(() => api(`/api/archive/${batch.id}/verify`, "POST"), { success: "Verified" })}
              >
                Verify file
              </Button>
            )}
            {generated && batch.fileSha256 && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">SHA-256 {batch.fileSha256}</p>
            )}
          </Step>
          <Step done={verified && downloaded} title="3. Download and keep the archive file">
            {verified && (
              <Button asChild variant="outline" className="mt-2" onClick={() => setDownloaded(true)}>
                <a href={`/api/archive/${batch.id}/file`}>Download archive (.xlsx)</a>
              </Button>
            )}
          </Step>
          <Step done={false} title="4. Confirm archiving">
            {verified && (
              <form
                className="mt-2 flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run(() => api(`/api/archive/${batch.id}/commit`, "POST", { confirmBatchId: confirm }), {
                    success: "Transactions archived",
                  });
                }}
              >
                <Input
                  className="w-72 font-mono"
                  placeholder={`Type ${batch.id} to confirm`}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  aria-label="Batch ID confirmation"
                />
                <Button type="submit" variant="destructive" disabled={pending || confirm.trim() !== batch.id}>
                  Archive transactions
                </Button>
              </form>
            )}
          </Step>
        </ol>
        <Button
          variant="ghost"
          className="mt-4"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Cancel this archive batch? Nothing has been archived yet.")) {
              void run(() => api(`/api/archive/${batch.id}/cancel`, "POST"), { success: "Batch cancelled" });
            }
          }}
        >
          Cancel batch
        </Button>
      </CardContent>
    </Card>
  );
}
