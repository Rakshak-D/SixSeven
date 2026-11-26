import { z } from "zod";
import { Id, IsoDate, Label, Paise, Qty } from "./common";

const WeekStart = IsoDate.refine((value) => new Date(`${value}T00:00:00.000Z`).getUTCDay() === 1, {
  message: "Week must start on Monday",
});

const OwnerWeeklySpend = z.strictObject({
  weekStart: WeekStart,
  materialsPaise: Paise,
  wagesPaise: Paise,
  otherPaise: Paise,
});

const EngineerWeeklySpend = z.strictObject({ weekStart: WeekStart, spendPaise: Paise });

const summary = {
  budgetPaise: Paise,
  spendPaise: Paise,
  burnRatePaisePerDay: Paise,
  materialVariance: z.array(
    z.strictObject({
      materialId: Id,
      name: Label,
      unit: Label,
      plannedQty: Qty,
      usedQty: Qty,
      tolerancePct: z.number().min(0).max(100),
      overTolerance: z.boolean(),
    }),
  ),
  stockAlerts: z.array(
    z.strictObject({ materialId: Id, name: Label, balance: Qty, lowStockQty: Qty }),
  ),
};
const spendSplit = z.strictObject({ materialsPaise: Paise, labourPaise: Paise, otherPaise: Paise });
export const FraudFlags = z.array(
  z.strictObject({
    kind: z.enum([
      "new_supplier",
      "bank_change",
      "unusual_material_price",
      "payment_without_verified_delivery",
      "missing_engineer_confirmation",
      "repeated_delivery_delays",
    ]),
    refType: z.enum(["supplier", "supplierPayment", "delivery", "expectedDelivery"]),
    refId: Id,
    raisedOn: IsoDate,
  }),
);
export type FraudFlags = z.infer<typeof FraudFlags>;
export const SummaryResponse = z.discriminatedUnion("role", [
  z.strictObject({
    ...summary,
    role: z.literal("engineer"),
    spendByWeek: z.array(EngineerWeeklySpend),
  }),
  z.strictObject({
    ...summary,
    role: z.literal("contractor"),
    spendSplit,
    spendByWeek: z.array(OwnerWeeklySpend),
  }),
  z.strictObject({
    ...summary,
    role: z.literal("owner"),
    spendSplit,
    spendByWeek: z.array(OwnerWeeklySpend),
    fraudFlags: FraudFlags.optional(),
  }),
]);

export type SummaryResponse = z.infer<typeof SummaryResponse>;
