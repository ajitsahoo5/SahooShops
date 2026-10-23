import { z } from "zod";
import { writeAudit } from "@/server/audit";
import { db } from "@/server/firebaseAdmin";
import { reportToXlsx } from "@/server/exports/excel";
import { exportFileName } from "@/server/exports/format";
import { reportToPdf } from "@/server/exports/pdf";
import { adminRoute } from "@/server/http";
import { buildReport } from "@/server/reports/builders";
import { parseReportParams } from "@/server/reports/filters";
import { readSettings } from "@/server/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

const formatSchema = z.enum(["xlsx", "pdf"]);

export const GET = adminRoute(async ({ req, actor }) => {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  const format = formatSchema.parse(params.format ?? "xlsx");
  const { report: reportId, filters } = parseReportParams(params);
  const [report, settings] = await Promise.all([buildReport(reportId, filters), readSettings()]);
  const body = format === "xlsx" ? await reportToXlsx(report, settings.shopName) : await reportToPdf(report, settings.shopName);

  const batch = db().batch();
  writeAudit(batch, actor, "report.export", "report", reportId, `Exported ${report.title} (${format}) for ${report.filterSummary}`);
  await batch.commit();

  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type":
        format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `${params.inline === "1" ? "inline" : "attachment"}; filename="${exportFileName(reportId, filters.from, filters.to, format)}"`,
      "Cache-Control": "no-store",
    },
  });
});
