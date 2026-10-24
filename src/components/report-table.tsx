import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDisplayDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import type { ColumnType, ReportCell, ReportTable } from "@/server/reports/types";

export function formatCell(value: ReportCell, type: ColumnType): string {
  if (value === null || value === undefined || value === "") return "-";
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

const NUMERIC: ColumnType[] = ["money", "qty", "number", "percent"];

export function ReportTableView({ report, maxRows = 1000 }: { report: ReportTable; maxRows?: number }) {
  const rows = report.rows.slice(0, maxRows);
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-indigo-950/[0.04]">
      <Table>
        <TableHeader>
          <TableRow>
            {report.columns.map((c) => (
              <TableHead key={c.key} className={NUMERIC.includes(c.type) ? "text-right" : undefined}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={report.columns.length} className="py-8 text-center text-muted-foreground">
                No data for these filters.
              </TableCell>
            </TableRow>
          )}
          {rows.map((row, i) => (
            <TableRow key={i}>
              {report.columns.map((c) => (
                <TableCell key={c.key} className={NUMERIC.includes(c.type) ? "text-right tabular-nums" : undefined}>
                  {formatCell(row[c.key] ?? null, c.type)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {report.totals && (
          <TableFooter>
            <TableRow>
              {report.columns.map((c, i) => (
                <TableCell key={c.key} className={NUMERIC.includes(c.type) ? "text-right tabular-nums" : undefined}>
                  {i === 0
                    ? String(report.totals?._label ?? "Total")
                    : report.totals && c.key in report.totals
                      ? formatCell(report.totals[c.key], typeof report.totals[c.key] === "string" ? "text" : c.type)
                      : ""}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        )}
      </Table>
      {report.rows.length > maxRows && (
        <p className="border-t p-2 text-xs text-muted-foreground">
          Showing the first {maxRows} of {report.rows.length} rows. Download the report for everything.
        </p>
      )}
    </div>
  );
}
