import Form from "next/form";
import { DownloadIcon } from "lucide-react";
import { NativeSelect } from "@/components/forms";
import { PageHeader } from "@/components/page-header";
import { ReportTableView } from "@/components/report-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/dates";
import { isDomainError } from "@/lib/errors";
import { param } from "@/lib/search-params";
import { requireAdminPage } from "@/server/auth";
import { buildReport } from "@/server/reports/builders";
import { parseReportParams, reportQueryString } from "@/server/reports/filters";
import { REPORT_IDS, REPORT_META } from "@/server/reports/types";

export const metadata = { title: "Reports" };

export default async function ReportsPage(props: PageProps<"/reports">) {
  await requireAdminPage();
  const sp = await props.searchParams;
  let parsed: ReturnType<typeof parseReportParams>;
  let error: string | null = null;
  try {
    parsed = parseReportParams({
      report: param(sp, "report"),
      from: param(sp, "from"),
      to: param(sp, "to"),
      includeArchived: param(sp, "includeArchived"),
    });
  } catch (e) {
    error = isDomainError(e) ? e.message : "Invalid filters.";
    parsed = parseReportParams({});
  }
  const { report: reportId, filters } = parsed;
  const meta = REPORT_META[reportId];
  const report = error ? null : await buildReport(reportId, filters);
  const qs = reportQueryString(reportId, filters);

  return (
    <>
      <PageHeader title="Reports" description="Preview a report, then download it as Excel or PDF." />
      <Form action="/reports" className="mb-4 flex flex-wrap items-end gap-2">
        <NativeSelect name="report" defaultValue={reportId} className="w-64" aria-label="Report">
          {REPORT_IDS.map((id) => (
            <option key={id} value={id}>
              {REPORT_META[id].title}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={filters.from} className="w-40" aria-label="From" />
        <Input type="date" name="to" defaultValue={filters.to} className="w-40" aria-label="To" />
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="includeArchived" value="true" defaultChecked={filters.includeArchived} /> Include archived
        </label>
        <Button type="submit" variant="secondary">
          Show report
        </Button>
      </Form>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{meta.title}</h2>
          <p className="text-sm text-muted-foreground">
            {meta.description}
            {report && ` ${report.filterSummary}. Generated ${formatDateTime(report.generatedAt)}.`}
          </p>
          {!meta.usesRange && <p className="text-xs text-muted-foreground">This report shows the current position; dates are ignored.</p>}
        </div>
        {report && (
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <a href={`/api/exports?${qs}&format=xlsx`}>
                <DownloadIcon /> Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/exports?${qs}&format=pdf`}>
                <DownloadIcon /> PDF
              </a>
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">{error}</p>}
      {report && <ReportTableView report={report} />}
      {report && report.notes.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </>
  );
}
