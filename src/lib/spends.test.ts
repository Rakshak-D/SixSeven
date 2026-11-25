import { describe, expect, it } from "vitest";
import { buildSpends } from "./spends";

const delivery = {
  id: "d1",
  materialId: "m1",
  occurredOn: "2026-11-26",
  createdAt: "2026-11-26T04:00:00.000Z",
  note: "Two bags damp",
  type: "delivery" as const,
  qty: 10,
  supplier: "Test Traders",
  challanNo: "C-1",
  unitCostPaise: 1000,
};
const fix = (id: string, newValue: number, reason: string, createdAt: string) => ({
  id,
  targetId: "d1",
  targetTable: "stock_movements" as const,
  oldValue: 10,
  newValue,
  reason,
  actorId: "u1",
  createdAt,
});

describe("buildSpends", () => {
  it("keeps the delivery note", () => {
    const [spend] = buildSpends({ movements: [delivery] });
    expect(spend.detail).toBe("Test Traders · challan C-1 · Two bags damp");
    expect(spend.fixReason).toBeNull();
  });
  it("shows the latest fix and its reason, whatever order the list is in", () => {
    const [spend] = buildSpends({
      movements: [delivery],
      adjustments: [
        fix("a2", 8, "Second count was right", "2026-11-26T06:00:00.000Z"),
        fix("a1", 9, "First count was short", "2026-11-26T05:00:00.000Z"),
      ],
    });
    expect(spend.amountPaise).toBe(8000);
    expect(spend.fixReason).toBe("Second count was right");
  });
});
