import { formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import type { ColumnType, ReportCell } from "../reports/types";

/** Text form of a report cell for PDF output. */
export function cellText(value: ReportCell | undefined, type: ColumnType): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "string") return type === "date" ? formatDisplayDate(value) : value;
  switch (type) {
    case "money":
      return formatINR(value);
    case "qty":
      return formatQty(value);
    case "percent":
      return `${value.toFixed(2)}%`;
    default:
      return String(value);
  }
}

export const NUMERIC_TYPES: ColumnType[] = ["money", "qty", "number", "percent"];

export function exportFileName(reportId: string, from: string, to: string, ext: "xlsx" | "pdf"): string {
  return `sahoo-shop-${reportId}-${from}-to-${to}.${ext}`;
}
