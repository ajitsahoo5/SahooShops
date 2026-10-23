import { mulDivRound, type Paise } from "./money";

/** Quantities are stored as integer thousandths of a unit (1.250 kg = 1250). */
export type QtyMilli = number;

export const QTY_SCALE = 1000;

const QTY_PATTERN = /^-?\d+(\.\d{1,3})?$/;

export function parseQty(input: string | number): QtyMilli {
  const text = (typeof input === "number" ? String(input) : input).trim().replace(/,/g, "");
  if (!QTY_PATTERN.test(text)) {
    throw new Error(`Invalid quantity: ${String(input)}`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const milli = Number(whole) * QTY_SCALE + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(milli)) {
    throw new Error(`Quantity out of range: ${String(input)}`);
  }
  return negative ? -milli : milli;
}

export function tryParseQty(input: string): QtyMilli | null {
  try {
    return input.trim() === "" ? null : parseQty(input);
  } catch {
    return null;
  }
}

/** Formats 1250 -> "1.25", 2000 -> "2". */
export function formatQty(milli: QtyMilli): string {
  const negative = milli < 0;
  const abs = Math.abs(milli);
  const whole = Math.floor(abs / QTY_SCALE);
  const fraction = String(abs % QTY_SCALE).padStart(3, "0").replace(/0+$/, "");
  const text = fraction ? `${whole.toLocaleString("en-IN")}.${fraction}` : whole.toLocaleString("en-IN");
  return negative ? `-${text}` : text;
}

export function qtyToInput(milli: QtyMilli): string {
  return formatQty(milli).replace(/,/g, "");
}

/** Line amount for a quantity at a per-unit price: round(qty * price). */
export function lineAmount(qtyMilli: QtyMilli, unitPricePaise: Paise): Paise {
  return mulDivRound(qtyMilli, unitPricePaise, QTY_SCALE);
}
