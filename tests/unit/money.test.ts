import { describe, expect, it } from "vitest";
import { allocateProRata, formatINR, mulDivRound, paiseToInput, parseRupees } from "@/lib/money";
import { formatQty, lineAmount, parseQty } from "@/lib/qty";

describe("parseRupees", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["1.5", 150],
    ["1.05", 105],
    ["1,234.56", 123456],
    ["₹ 99.99", 9999],
    ["-2.50", -250],
    [12.34, 1234],
  ])("parses %s", (input, expected) => {
    expect(parseRupees(input)).toBe(expected);
  });

  it.each(["", "abc", "1.234", "1..2", "1e3"])("rejects %s", (input) => {
    expect(() => parseRupees(input)).toThrow();
  });

  it("avoids floating point errors", () => {
    expect(parseRupees("0.29")).toBe(29);
    expect(parseRupees("1.10")).toBe(110);
  });
});

describe("formatting", () => {
  it("formats INR with Indian grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(paiseToInput(123450)).toBe("1234.50");
    expect(paiseToInput(-5)).toBe("-0.05");
  });

  it("formats quantities", () => {
    expect(formatQty(1250)).toBe("1.25");
    expect(formatQty(2000)).toBe("2");
    expect(formatQty(-500)).toBe("-0.5");
    expect(parseQty("1.250")).toBe(1250);
    expect(parseQty("3")).toBe(3000);
    expect(() => parseQty("1.2345")).toThrow();
  });
});

describe("mulDivRound", () => {
  it("rounds half away from zero", () => {
    expect(mulDivRound(1, 1, 2)).toBe(1);
    expect(mulDivRound(-1, 1, 2)).toBe(-1);
    expect(mulDivRound(10, 1, 3)).toBe(3);
    expect(mulDivRound(20, 1, 3)).toBe(7);
  });

  it("handles large values exactly", () => {
    expect(mulDivRound(900_000_000_000, 1_000_000, 1_000_000)).toBe(900_000_000_000);
  });

  it("computes line amounts for fractional quantities", () => {
    expect(lineAmount(1250, 4000)).toBe(5000);
    expect(lineAmount(333, 100)).toBe(33);
  });
});

describe("allocateProRata", () => {
  it("allocates exactly the total", () => {
    const parts = allocateProRata(100, [1, 1, 1]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts).toEqual([34, 33, 33]);
  });

  it("is proportional", () => {
    expect(allocateProRata(1000, [3000, 1000])).toEqual([750, 250]);
  });

  it("handles zero weights", () => {
    expect(allocateProRata(50, [0, 0])).toEqual([50, 0]);
    expect(allocateProRata(0, [10, 20])).toEqual([0, 0]);
  });
});
