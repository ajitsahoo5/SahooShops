import { describe, expect, it } from "vitest";
import { DomainError } from "@/lib/errors";
import { applyMovement, averageUnitCost, stockStatusOf, type MovementInput, type StockState } from "@/server/inventory/costing";

const strict = { allowNegativeStock: false };
const empty: StockState = { qtyMilli: 0, valuePaise: 0, lastCostPaise: 0 };

function run(state: StockState, inputs: MovementInput[], options = strict) {
  let s = state;
  let valueSum = state.valuePaise;
  let qtySum = state.qtyMilli;
  for (const input of inputs) {
    const out = applyMovement(s, input, options);
    valueSum += out.valueDeltaPaise;
    qtySum += out.qtyDeltaMilli;
    s = out.after;
  }
  expect(s.valuePaise).toBe(valueSum);
  expect(s.qtyMilli).toBe(qtySum);
  return s;
}

describe("weighted-average costing", () => {
  it("averages purchases at different costs", () => {
    const s = run(empty, [
      { kind: "in", qtyMilli: 10_000, valuePaise: 10_000 }, // 10 @ ₹10
      { kind: "in", qtyMilli: 10_000, valuePaise: 20_000 }, // 10 @ ₹20
    ]);
    expect(averageUnitCost(s)).toBe(1500);
  });

  it("costs sales at the average and keeps value consistent", () => {
    const start = run(empty, [
      { kind: "in", qtyMilli: 3_000, valuePaise: 1_000 }, // 3 units for ₹10.00
    ]);
    const after1 = applyMovement(start, { kind: "outAverage", qtyMilli: 1_000 }, strict);
    expect(after1.valueDeltaPaise).toBe(-333);
    const after2 = applyMovement(after1.after, { kind: "outAverage", qtyMilli: 1_000 }, strict);
    expect(after2.valueDeltaPaise).toBe(-334);
    const after3 = applyMovement(after2.after, { kind: "outAverage", qtyMilli: 1_000 }, strict);
    // The last unit takes whatever value remains, so nothing is left behind.
    expect(after3.valueDeltaPaise).toBe(-333);
    expect(after3.after).toMatchObject({ qtyMilli: 0, valuePaise: 0 });
  });

  it("never drifts over many fractional sales", () => {
    let s = run(empty, [{ kind: "in", qtyMilli: 7_000, valuePaise: 10_001 }]);
    let cogs = 0;
    for (let i = 0; i < 7; i++) {
      const out = applyMovement(s, { kind: "outAverage", qtyMilli: 1_000 }, strict);
      cogs -= out.valueDeltaPaise;
      s = out.after;
    }
    expect(cogs).toBe(10_001);
    expect(s.valuePaise).toBe(0);
  });

  it("rejects selling more than on hand by default", () => {
    const s = run(empty, [{ kind: "in", qtyMilli: 1_000, valuePaise: 500 }]);
    expect(() => applyMovement(s, { kind: "outAverage", qtyMilli: 2_000 }, strict)).toThrowError(DomainError);
  });

  it("allows negative stock when enabled, costing the excess at last cost", () => {
    const s: StockState = { qtyMilli: 1_000, valuePaise: 500, lastCostPaise: 600 };
    const out = applyMovement(s, { kind: "outAverage", qtyMilli: 2_000 }, { allowNegativeStock: true });
    expect(out.after.qtyMilli).toBe(-1_000);
    expect(out.valueDeltaPaise).toBe(-1_000);
    const fromNegative = applyMovement(out.after, { kind: "outAverage", qtyMilli: 1_000 }, { allowNegativeStock: true });
    expect(fromNegative.valueDeltaPaise).toBe(-600);
  });

  it("reverses a purchase at its original value", () => {
    const s = run(empty, [
      { kind: "in", qtyMilli: 10_000, valuePaise: 10_000 },
      { kind: "in", qtyMilli: 10_000, valuePaise: 20_000 },
    ]);
    const out = applyMovement(s, { kind: "outValue", qtyMilli: 10_000, valuePaise: 20_000 }, strict);
    expect(out.after).toMatchObject({ qtyMilli: 10_000, valuePaise: 10_000 });
  });

  it("clamps a purchase reversal so value never goes negative", () => {
    // Opening 10 @ ₹10, purchase 10 @ ₹20, sell 10 at average ₹15, then reverse the purchase.
    const s = run(empty, [
      { kind: "in", qtyMilli: 10_000, valuePaise: 10_000 },
      { kind: "in", qtyMilli: 10_000, valuePaise: 20_000 },
      { kind: "outAverage", qtyMilli: 10_000 },
    ]);
    expect(s.valuePaise).toBe(15_000);
    const out = applyMovement(s, { kind: "outValue", qtyMilli: 10_000, valuePaise: 20_000 }, strict);
    expect(out.after).toMatchObject({ qtyMilli: 0, valuePaise: 0 });
    expect(out.valueDeltaPaise).toBe(-15_000);
  });

  it("blocks purchase reversal without enough stock even when negative stock is allowed", () => {
    const s: StockState = { qtyMilli: 1_000, valuePaise: 100, lastCostPaise: 100 };
    expect(() =>
      applyMovement(s, { kind: "outValue", qtyMilli: 2_000, valuePaise: 200 }, { allowNegativeStock: true }),
    ).toThrowError(/Not enough stock/);
  });

  it("restores a returned sale at its original cost of goods", () => {
    const s = run(empty, [
      { kind: "in", qtyMilli: 4_000, valuePaise: 4_000 },
      { kind: "outAverage", qtyMilli: 1_000 },
      { kind: "in", qtyMilli: 1_000, valuePaise: 1_000 },
    ]);
    expect(s).toMatchObject({ qtyMilli: 4_000, valuePaise: 4_000 });
  });

  it("validates quantities and values", () => {
    expect(() => applyMovement(empty, { kind: "in", qtyMilli: 0, valuePaise: 0 }, strict)).toThrow();
    expect(() => applyMovement(empty, { kind: "in", qtyMilli: 1, valuePaise: -1 }, strict)).toThrow();
  });
});

describe("stockStatusOf", () => {
  it("classifies stock levels", () => {
    expect(stockStatusOf(0, 5_000)).toBe("out");
    expect(stockStatusOf(-1, 0)).toBe("out");
    expect(stockStatusOf(5_000, 5_000)).toBe("low");
    expect(stockStatusOf(5_001, 5_000)).toBe("ok");
    expect(stockStatusOf(1, 0)).toBe("ok");
  });
});
