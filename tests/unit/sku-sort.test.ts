import { describe, expect, it } from "vitest";
import { compareSku } from "@/lib/sku-sort";

describe("compareSku", () => {
  it("orders whole-number SKUs by value", () => {
    expect(["10", "2", "100", "1"].sort(compareSku)).toEqual(["1", "2", "10", "100"]);
    expect(["1", "2", "10", "100"].sort((a, b) => -compareSku(a, b))).toEqual(["100", "10", "2", "1"]);
  });

  it("keeps letter SKUs in text order after numbers", () => {
    expect(["SUG-1", "10", "DAL-2", "DAL-1"].sort(compareSku)).toEqual(["10", "DAL-1", "DAL-2", "SUG-1"]);
  });
});
