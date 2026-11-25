import { describe, expect, it } from "vitest";
import { accruedPaise } from "./wage-calculations";

describe("shared accrued-wage arithmetic", () => {
  it("uses exact half-day arithmetic for even-paise rate snapshots", () => {
    expect(accruedPaise(BigInt(0), BigInt(90_000))).toBe(BigInt(0));
    expect(accruedPaise(BigInt(1), BigInt(90_000))).toBe(BigInt(45_000));
    expect(accruedPaise(BigInt(2), BigInt(90_000))).toBe(BigInt(90_000));
    expect(accruedPaise(BigInt(3), BigInt(90_000))).toBe(BigInt(135_000));
  });

  it("retains exact paise beyond JavaScript's safe integer range until checked", () => {
    const exact = BigInt("9007199254740990");
    expect(accruedPaise(BigInt(2), exact)).toBe(exact);
  });
});
