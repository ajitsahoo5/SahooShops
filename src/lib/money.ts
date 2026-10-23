/** Integer paise. 100 paise = 1 rupee. */
export type Paise = number;

const AMOUNT_PATTERN = /^-?\d+(\.\d{1,2})?$/;

export function assertPaise(value: number, label = "amount"): Paise {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be an integer number of paise`);
  }
  return value;
}

/** Parses a rupee string such as "1,234.5" into paise without floating-point math. */
export function parseRupees(input: string | number): Paise {
  const text = (typeof input === "number" ? input.toFixed(2) : input)
    .trim()
    .replace(/,/g, "")
    .replace(/^₹\s*/, "");
  if (!AMOUNT_PATTERN.test(text)) {
    throw new Error(`Invalid amount: ${String(input)}`);
  }
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const paise = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Amount out of range: ${String(input)}`);
  }
  return negative ? -paise : paise;
}

export function tryParseRupees(input: string): Paise | null {
  try {
    return input.trim() === "" ? null : parseRupees(input);
  } catch {
    return null;
  }
}

/** Plain decimal string for form inputs, e.g. 123450 -> "1234.50". */
export function paiseToInput(paise: Paise): string {
  const negative = paise < 0;
  const abs = Math.abs(paise);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const plainFormatter = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats paise as Indian Rupees, e.g. 12345678 -> "₹1,23,456.78". */
export function formatINR(paise: Paise): string {
  return inrFormatter.format(paise / 100);
}

/** Formats paise with Indian digit grouping but without the currency symbol. */
export function formatRupeesPlain(paise: Paise): string {
  return plainFormatter.format(paise / 100);
}

/**
 * Computes round(a * b / c) exactly using BigInt, rounding half away from zero.
 * Used for every proportional money calculation so results never drift.
 */
export function mulDivRound(a: number, b: number, c: number): number {
  if (c === 0) throw new Error("Division by zero");
  const numerator = BigInt(a) * BigInt(b);
  const denominator = BigInt(c);
  const negative = numerator < BigInt(0) !== denominator < BigInt(0);
  const absNum = numerator < BigInt(0) ? -numerator : numerator;
  const absDen = denominator < BigInt(0) ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * BigInt(2) >= absDen ? quotient + BigInt(1) : quotient;
  const result = Number(negative ? -rounded : rounded);
  return result === 0 ? 0 : result;
}

/**
 * Splits `total` across `weights` proportionally using the largest-remainder method,
 * so the parts always sum exactly to `total`.
 */
export function allocateProRata(total: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0) return [];
  if (weightSum === 0) {
    return weights.map((_, i) => (i === 0 ? total : 0));
  }
  const base = weights.map((w) => {
    const exact = BigInt(total) * BigInt(w);
    return Number(exact / BigInt(weightSum));
  });
  let remaining = total - base.reduce((sum, v) => sum + v, 0);
  const order = weights
    .map((w, i) => ({
      i,
      rem: Number((BigInt(total) * BigInt(w)) % BigInt(weightSum)),
    }))
    .sort((x, y) => y.rem - x.rem || x.i - y.i);
  for (let k = 0; remaining > 0 && k < order.length; k++, remaining--) {
    base[order[k].i] += 1;
  }
  return base;
}

export function sumPaise(values: Paise[]): Paise {
  return values.reduce((sum, v) => sum + v, 0);
}
