import { DomainError } from "./errors";
import { allocateProRata, mulDivRound, type Paise } from "./money";
import { lineAmount, type QtyMilli } from "./qty";

export interface LineInput {
  qtyMilli: QtyMilli;
  unitPricePaise: Paise;
  discountPaise: Paise;
}

export interface ComputedLine {
  grossPaise: Paise;
  lineTotalPaise: Paise;
  billDiscountSharePaise: Paise;
  netPaise: Paise;
}

export interface ComputedTotals {
  grossPaise: Paise;
  itemDiscountPaise: Paise;
  subtotalPaise: Paise;
  billDiscountPaise: Paise;
  totalPaise: Paise;
}

/**
 * Computes line and invoice totals. The bill discount is spread across lines in proportion to
 * their totals, so each line's `netPaise` is what it really sold or cost for.
 */
export function computeInvoice(
  items: LineInput[],
  billDiscountPaise: Paise,
): { lines: ComputedLine[]; totals: ComputedTotals } {
  const partial = items.map((item, index) => {
    const grossPaise = lineAmount(item.qtyMilli, item.unitPricePaise);
    if (item.discountPaise > grossPaise) {
      throw new DomainError("VALIDATION", `Line ${index + 1}: discount is more than the line amount.`);
    }
    return { grossPaise, lineTotalPaise: grossPaise - item.discountPaise };
  });
  const subtotalPaise = partial.reduce((sum, l) => sum + l.lineTotalPaise, 0);
  if (billDiscountPaise > subtotalPaise) {
    throw new DomainError("VALIDATION", "Bill discount is more than the subtotal.");
  }
  const shares = allocateProRata(
    billDiscountPaise,
    partial.map((l) => l.lineTotalPaise),
  );
  const lines = partial.map((l, i) => ({
    ...l,
    billDiscountSharePaise: shares[i] ?? 0,
    netPaise: l.lineTotalPaise - (shares[i] ?? 0),
  }));
  const grossPaise = partial.reduce((sum, l) => sum + l.grossPaise, 0);
  return {
    lines,
    totals: {
      grossPaise,
      itemDiscountPaise: grossPaise - subtotalPaise,
      subtotalPaise,
      billDiscountPaise,
      totalPaise: subtotalPaise - billDiscountPaise,
    },
  };
}

/**
 * Value of a partial return. Computed from cumulative quantities so that returning a line in
 * several parts always adds up exactly to the full line amount.
 */
export function proRataPortion(
  lineAmountPaise: Paise,
  lineQtyMilli: QtyMilli,
  previouslyReturnedQtyMilli: QtyMilli,
  returnQtyMilli: QtyMilli,
): Paise {
  const before = mulDivRound(lineAmountPaise, previouslyReturnedQtyMilli, lineQtyMilli);
  const after = mulDivRound(lineAmountPaise, previouslyReturnedQtyMilli + returnQtyMilli, lineQtyMilli);
  return after - before;
}

/** Gross profit = net sales minus net cost of goods. */
export function grossProfit(input: {
  salesPaise: Paise;
  returnsPaise: Paise;
  cogsPaise: Paise;
  returnsCogsPaise: Paise;
}): Paise {
  return input.salesPaise - input.returnsPaise - (input.cogsPaise - input.returnsCogsPaise);
}

export function operatingProfit(grossProfitPaise: Paise, expensesPaise: Paise): Paise {
  return grossProfitPaise - expensesPaise;
}
