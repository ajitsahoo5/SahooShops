import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsToMonthStart,
  archiveCutoff,
  businessDate,
  daysInRange,
  eachDate,
  endOfMonth,
  isBusinessDate,
} from "@/lib/dates";

describe("business dates in IST", () => {
  it("uses Asia/Kolkata for the day boundary", () => {
    // 18:29 UTC is 23:59 IST; 18:30 UTC is midnight IST the next day.
    expect(businessDate(new Date("2026-03-31T18:29:59Z"))).toBe("2026-03-31");
    expect(businessDate(new Date("2026-03-31T18:30:00Z"))).toBe("2026-04-01");
  });

  it("validates dates", () => {
    expect(isBusinessDate("2026-02-28")).toBe(true);
    expect(isBusinessDate("2026-02-30")).toBe(false);
    expect(isBusinessDate("2026-2-1")).toBe(false);
  });

  it("does date arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addMonthsToMonthStart("2026-01-15", -1)).toBe("2025-12-01");
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
    expect(daysInRange("2026-01-01", "2026-01-31")).toBe(31);
    expect(eachDate("2026-01-30", "2026-02-02")).toEqual(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]);
  });
});

describe("archiveCutoff", () => {
  it("is the first of the month six calendar months back", () => {
    expect(archiveCutoff("2026-10-23")).toBe("2026-04-01");
    expect(archiveCutoff("2026-03-01")).toBe("2025-09-01");
    expect(archiveCutoff("2026-07-31")).toBe("2026-01-01");
  });
});
