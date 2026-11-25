import { describe, expect, it } from "vitest";
import { type Order, releaseCheck, type Supplier } from "./supplier-payments";

const supplier: Supplier = {
  id: "s1",
  name: "Shree Traders",
  gstin: "29ABCDE1234F1Z5",
  accountLast4: "4821",
  approved: true,
  autopay: { enabled: true, perBillCapPaise: 100_000, perWeekCapPaise: 150_000 },
  bankChange: null,
};
const order: Order = {
  id: "o1",
  supplierId: "s1",
  materialId: "cement",
  qty: 100,
  remainingQty: 50,
  maxUnitPricePaise: 1_000,
};
const now = new Date("2026-11-26T06:00:00.000Z");
const check = (over: Partial<Parameters<typeof releaseCheck>[0]> = {}) =>
  releaseCheck({
    bill: { materialId: "cement", qty: 40, unitPricePaise: 1_000 },
    supplier,
    orders: [order],
    paused: false,
    weekPaidPaise: 0,
    now,
    ...over,
  });

describe("releaseCheck", () => {
  it("releases a bill inside the order and the limits", () => {
    expect(check()).toEqual({ amountPaise: 40_000, blocked: null, held: null });
  });
  it("never pays above the order's rate or remaining quantity", () => {
    const dear = check({ bill: { materialId: "cement", qty: 40, unitPricePaise: 1_500 } });
    expect(dear.amountPaise).toBe(40_000);
    expect(dear.held).toMatch(/rate/);
    const extra = check({ bill: { materialId: "cement", qty: 80, unitPricePaise: 900 } });
    expect(extra.amountPaise).toBe(45_000);
    expect(extra.held).toMatch(/More arrived/);
  });
  it("holds on pause, autopay off and each limit", () => {
    expect(check({ paused: true }).held).toMatch(/paused/);
    expect(
      check({ supplier: { ...supplier, autopay: { ...supplier.autopay, enabled: false } } }).held,
    ).toMatch(/off/);
    expect(
      check({
        supplier: { ...supplier, autopay: { ...supplier.autopay, perBillCapPaise: 39_999 } },
      }).held,
    ).toMatch(/per-bill/);
    expect(check({ weekPaidPaise: 120_000 }).held).toMatch(/weekly/);
  });
  it("blocks everyone without an approved supplier or order, or while bank details change", () => {
    expect(check({ supplier: undefined }).blocked).toBeTruthy();
    expect(check({ supplier: { ...supplier, approved: false } }).blocked).toBeTruthy();
    expect(check({ orders: [] }).blocked).toMatch(/order/);
    const change = { accountLast4: "9999", requestedAt: now.toISOString() };
    for (const effectiveAt of [null, "2026-11-27T06:00:00.000Z"]) {
      expect(
        check({ supplier: { ...supplier, bankChange: { ...change, effectiveAt } } }).blocked,
      ).toMatch(/bank/);
    }
    expect(
      check({
        supplier: {
          ...supplier,
          bankChange: { ...change, effectiveAt: "2026-11-26T05:00:00.000Z" },
        },
      }).blocked,
    ).toBeNull();
  });
});
