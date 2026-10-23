/** Business dates are YYYY-MM-DD strings in the shop's time zone. */
export type BusinessDate = string;

export const SHOP_TIME_ZONE = "Asia/Kolkata";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function businessDate(at: Date = new Date()): BusinessDate {
  return dateFormatter.format(at);
}

export function isBusinessDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function monthKeyOf(date: BusinessDate): string {
  return date.slice(0, 7);
}

function toUtc(date: BusinessDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtc(d: Date): BusinessDate {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: BusinessDate, days: number): BusinessDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

export function startOfMonth(date: BusinessDate): BusinessDate {
  return `${date.slice(0, 7)}-01`;
}

export function addMonthsToMonthStart(date: BusinessDate, months: number): BusinessDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const y = year + Math.floor(month / 12);
  const m = ((month % 12) + 12) % 12;
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-01`;
}

export function endOfMonth(date: BusinessDate): BusinessDate {
  return addDays(addMonthsToMonthStart(date, 1), -1);
}

/** Days from `from` to `to`, inclusive. */
export function daysInRange(from: BusinessDate, to: BusinessDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000) + 1;
}

export function eachDate(from: BusinessDate, to: BusinessDate, limit = 1100): BusinessDate[] {
  const out: BusinessDate[] = [];
  for (let d = from; d <= to && out.length < limit; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Transactions dated before this cutoff are eligible for archiving: the first day of the
 * current month, minus `months` calendar months.
 */
export function archiveCutoff(today: BusinessDate, months = 6): BusinessDate {
  return addMonthsToMonthStart(startOfMonth(today), -months);
}

export function formatDisplayDate(date: BusinessDate): string {
  if (!isBusinessDate(date)) return date;
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: SHOP_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
