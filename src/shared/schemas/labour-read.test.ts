import { describe, expect, it } from "vitest";
import { AdjustmentListQuery, AdjustmentListResponse } from "./adjustments";
import { AttendanceListQuery, AttendanceListResponse } from "./attendance";
import { WagePaymentListQuery, WagePaymentListResponse } from "./wages";

describe("labour read contracts", () => {
  it("validates optional inclusive date and identifier filters", () => {
    for (const schema of [AttendanceListQuery, WagePaymentListQuery]) {
      expect(
        schema.safeParse({ workerId: "worker-1", from: "2026-01-01", to: "2026-01-31" }).success,
      ).toBe(true);
      expect(schema.safeParse({ from: "2026-02-01", to: "2026-01-31" }).success).toBe(false);
      expect(schema.safeParse({ from: "2026-02-30" }).success).toBe(false);
    }
    expect(
      AdjustmentListQuery.safeParse({ targetTable: "attendance", targetId: "a1" }).success,
    ).toBe(true);
    expect(AdjustmentListQuery.safeParse({ targetTable: "unknown" }).success).toBe(false);
  });

  it("preserves original and effective values without private fields", () => {
    const createdAt = "2026-11-25T10:00:00.000Z";
    const attendance = {
      id: "a1",
      workerId: "w1",
      workDate: "2026-11-25",
      halfDays: 2,
      effectiveHalfDays: 1,
      ratePaise: 90000,
      createdAt,
    };
    expect(AttendanceListResponse.parse([attendance])).toEqual([attendance]);
    expect(
      AttendanceListResponse.safeParse([{ ...attendance, effectiveHalfDays: 3 }]).success,
    ).toBe(false);
    const payment = {
      id: "p1",
      workerId: "w1",
      amountPaise: 100,
      effectiveAmountPaise: 200,
      kind: "advance",
      mode: "cash",
      paidOn: "2026-11-25",
      reference: null,
      createdAt,
    };
    expect(WagePaymentListResponse.parse([payment])).toEqual([payment]);
    expect(WagePaymentListResponse.safeParse([{ ...payment, password: "secret" }]).success).toBe(
      false,
    );
    const adjustment = {
      id: "c1",
      targetId: "a1",
      targetTable: "attendance",
      oldValue: 2,
      newValue: 1,
      reason: "Corrected site register",
      actorId: "u1",
      createdAt,
    };
    expect(AdjustmentListResponse.parse([adjustment])).toEqual([adjustment]);
    expect(AdjustmentListResponse.safeParse([{ ...adjustment, newValue: 4 }]).success).toBe(false);
  });
});
