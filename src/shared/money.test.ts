import { describe, expect, it } from "vitest";
import { formatINR, rupeesToPaise } from "./money";

describe("money", () => {
  it("formats paise as whole rupees with Indian grouping", () => {
    expect(formatINR(250_000_000)).toBe("₹25,00,000");
    expect(formatINR(42_000)).toBe("₹420");
  });

  it("parses rupee input to exact paise", () => {
    expect(rupeesToPaise("420")).toBe(42_000);
    expect(rupeesToPaise("420.5")).toBe(42_050);
    expect(rupeesToPaise("0.07")).toBe(7);
  });

  it("rejects floats with more than 2 decimals and non-numbers", () => {
    expect(() => rupeesToPaise("1.005")).toThrow(RangeError);
    expect(() => rupeesToPaise("abc")).toThrow(RangeError);
    expect(() => formatINR(1.5)).toThrow(RangeError);
  });
});
