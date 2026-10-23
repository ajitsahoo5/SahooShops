import { z } from "zod";
import { businessDate, daysInRange, isBusinessDate, startOfMonth } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { REPORT_IDS, type ReportFilters, type ReportId } from "./types";

const MAX_RANGE_DAYS = 731;

const schema = z.object({
  report: z.enum(REPORT_IDS).default("sales"),
  from: z.string().optional(),
  to: z.string().optional(),
  includeArchived: z.string().optional(),
});

/** Parses report filters from query parameters, defaulting to the current month. */
export function parseReportParams(params: Record<string, string | undefined>): { report: ReportId; filters: ReportFilters } {
  const parsed = schema.safeParse(params);
  if (!parsed.success) throw new DomainError("VALIDATION", "Unknown report.");
  const today = businessDate();
  const from = parsed.data.from && isBusinessDate(parsed.data.from) ? parsed.data.from : startOfMonth(today);
  const to = parsed.data.to && isBusinessDate(parsed.data.to) ? parsed.data.to : today;
  if (from > to) throw new DomainError("VALIDATION", "Start date must be on or before end date.");
  if (daysInRange(from, to) > MAX_RANGE_DAYS) throw new DomainError("VALIDATION", "Choose a range of two years or less.");
  return {
    report: parsed.data.report,
    filters: { from, to, includeArchived: parsed.data.includeArchived === "true" },
  };
}

export function reportQueryString(report: ReportId, f: ReportFilters): string {
  const q = new URLSearchParams({ report, from: f.from, to: f.to });
  if (f.includeArchived) q.set("includeArchived", "true");
  return q.toString();
}
