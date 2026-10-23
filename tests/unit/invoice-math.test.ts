import { describe, expect, it } from "vitest";
import { computeInvoice, grossProfit, operatingProfit, proRataPortion } from "@/lib/invoice-math";

describe("computeInvoice", () => {
  it("computes line discounts, bill discount allocation and totals", () => {
    const { lines, totals } = computeInvoice(
      [
        { qtyMilli: 2_000, unitPricePaise: 5_000, discountPaise: 1_000 },
        { qtyMilli: 500, unitPricePaise: 4_000, discountPaise: 0 },
      ],
      1_100,
    );
    expect(lines.map((l) => l.lineTotalPaise)).toEqual([9_000, 2_000]);
    expect(lines.map((l) => l.netPaise)).toEqual([8_100, 1_800]);
    expect(totals).toEqual({
      grossPaise: 12_000,
      itemDiscountPaise: 1_000,
      subtotalPaise: 11_000,
      billDiscountPaise: 1_100,
      totalPaise: 9_900,
    });
    expect(lines.reduce((s, l) => s + l.netPaise, 0)).toBe(totals.totalPaise);
  });

  it("rejects discounts larger than the amount", () => {
    expect(() => computeInvoice([{ qtyMilli: 1_000, unitPricePaise: 100, discountPaise: 101 }], 0)).toThrow(/discount/);
    expect(() => computeInvoice([{ qtyMilli: 1_000, unitPricePaise: 100, discountPaise: 0 }], 101)).toThrow(/Bill discount/);
  });
});

describe("proRataPortion", () => {
  it("sums exactly over partial returns", () => {
    const parts = [1_000, 1_000, 1_000].map((q, i) => proRataPortion(1_000, 3_000, i * 1_000, q));
    expect(parts).toEqual([333, 334, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1_000);
  });
});

describe("profit", () => {
  it("nets returns from sales and cost of goods", () => {
    const gp = grossProfit({ salesPaise: 10_000, returnsPaise: 1_000, cogsPaise: 6_000, returnsCogsPaise: 600 });
    expect(gp).toBe(3_600);
    expect(operatingProfit(gp, 1_000)).toBe(2_600);
  });
});
