import { describe, expect, it } from "vitest";
import type { AdjustmentResponse } from "@/shared/schemas/adjustments";
import { firstProblem, parseQty, rupeesToPaise } from "./forms";
import { effectiveValue } from "./today/fix-sheet";

describe("form parsing", () => {
  it("reads quantities to the thousandth and rejects blanks and text", () => {
    expect(parseQty(" 12.3456 ")).toBe(12.346);
    expect(parseQty("")).toBeUndefined();
    expect(parseQty("abc")).toBeUndefined();
  });

  it("turns rupees into whole paise without float drift", () => {
    expect(rupeesToPaise("415.50")).toBe(41_550);
    expect(rupeesToPaise("0.29")).toBe(29);
    expect(rupeesToPaise(" ")).toBeUndefined();
  });

  it("reports the first failed check only", () => {
    expect(
      firstProblem([
        [false, "a"],
        [true, "b"],
        [true, "c"],
      ]),
    ).toBe("b");
    expect(firstProblem([[false, "a"]])).toBeUndefined();
  });
});

describe("effectiveValue", () => {
  const fix = (targetId: string, newValue: number) =>
    ({ targetId, newValue, targetTable: "stock_movements" }) as AdjustmentResponse;

  it("uses the newest correction (the list is newest first), else the original", () => {
    const list = [fix("m1", 8), fix("m2", 3), fix("m1", 10)];
    expect(effectiveValue(list, "m1", 12)).toBe(8);
    expect(effectiveValue(list, "m3", 5)).toBe(5);
    expect(effectiveValue(undefined, "m1", 12)).toBe(12);
  });
});
