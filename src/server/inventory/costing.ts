import { DomainError } from "@/lib/errors";
import { mulDivRound, type Paise } from "@/lib/money";
import { lineAmount, QTY_SCALE, type QtyMilli } from "@/lib/qty";
import type { StockStatus } from "../types";

export interface StockState {
  qtyMilli: QtyMilli;
  valuePaise: Paise;
  /** Per-unit fallback cost used when there is no stock on hand to average. */
  lastCostPaise: Paise;
}

export type MovementInput =
  /** Stock in at an explicit total value (purchase, opening, return, reversal of a sale). */
  | { kind: "in"; qtyMilli: QtyMilli; valuePaise: Paise }
  /** Stock out at the current weighted-average cost (sale, negative adjustment). */
  | { kind: "outAverage"; qtyMilli: QtyMilli }
  /** Stock out at an explicit original value (purchase reversal). Never allows negative stock. */
  | { kind: "outValue"; qtyMilli: QtyMilli; valuePaise: Paise };

export interface MovementOutcome {
  qtyDeltaMilli: QtyMilli;
  valueDeltaPaise: Paise;
  after: StockState;
}

export interface CostingOptions {
  allowNegativeStock: boolean;
}

/** Weighted-average cost per unit, in paise. */
export function averageUnitCost(state: StockState): Paise {
  if (state.qtyMilli <= 0) return state.lastCostPaise;
  return mulDivRound(state.valuePaise, QTY_SCALE, state.qtyMilli);
}

export function stockStatusOf(qtyMilli: QtyMilli, reorderLevelMilli: QtyMilli): StockStatus {
  if (qtyMilli <= 0) return "out";
  if (reorderLevelMilli > 0 && qtyMilli <= reorderLevelMilli) return "low";
  return "ok";
}

function assertPositiveQty(qtyMilli: number) {
  if (!Number.isSafeInteger(qtyMilli) || qtyMilli <= 0) {
    throw new DomainError("VALIDATION", "Quantity must be greater than zero.");
  }
}

/**
 * The single place where stock quantity and value change. Pure: returns the new state and the
 * deltas to record in the stock ledger. Inventory value always equals the sum of value deltas.
 */
export function applyMovement(state: StockState, input: MovementInput, options: CostingOptions): MovementOutcome {
  assertPositiveQty(input.qtyMilli);
  const q = input.qtyMilli;

  if (input.kind === "in") {
    if (!Number.isSafeInteger(input.valuePaise) || input.valuePaise < 0) {
      throw new DomainError("VALIDATION", "Stock value must be zero or more.");
    }
    return {
      qtyDeltaMilli: q,
      valueDeltaPaise: input.valuePaise,
      after: {
        qtyMilli: state.qtyMilli + q,
        valuePaise: state.valuePaise + input.valuePaise,
        lastCostPaise: state.lastCostPaise,
      },
    };
  }

  const newQty = state.qtyMilli - q;

  if (input.kind === "outValue") {
    if (newQty < 0) {
      throw new DomainError("INSUFFICIENT_STOCK", "Not enough stock to reverse this quantity.");
    }
    // Remove the original value, but never more than is on hand, and clear any residue at zero.
    const valueOut = newQty === 0 ? state.valuePaise : Math.max(0, Math.min(input.valuePaise, state.valuePaise));
    return {
      qtyDeltaMilli: -q,
      valueDeltaPaise: -valueOut,
      after: { qtyMilli: newQty, valuePaise: state.valuePaise - valueOut, lastCostPaise: state.lastCostPaise },
    };
  }

  if (newQty < 0 && !options.allowNegativeStock) {
    throw new DomainError("INSUFFICIENT_STOCK", "Not enough stock.");
  }

  let valueOut: Paise;
  if (state.qtyMilli <= 0) {
    valueOut = lineAmount(q, state.lastCostPaise);
  } else if (q === state.qtyMilli) {
    valueOut = state.valuePaise;
  } else if (q < state.qtyMilli) {
    valueOut = mulDivRound(state.valuePaise, q, state.qtyMilli);
  } else {
    // Selling past zero (only when negative stock is allowed): the excess is costed at average.
    valueOut = state.valuePaise + lineAmount(q - state.qtyMilli, averageUnitCost(state));
  }

  return {
    qtyDeltaMilli: -q,
    valueDeltaPaise: -valueOut,
    after: { qtyMilli: newQty, valuePaise: state.valuePaise - valueOut, lastCostPaise: state.lastCostPaise },
  };
}
