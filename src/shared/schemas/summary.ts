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
export const SummaryResponse = z.discriminatedUnion("role", [
  z.strictObject({
    ...summary,
    role: z.literal("engineer"),
    spendByWeek: z.array(EngineerWeeklySpend),
  }),
  z.strictObject({
    ...summary,
    role: z.enum(["owner", "contractor"]),
    spendSplit,
    spendByWeek: z.array(OwnerWeeklySpend),
  }),
]);

export type SummaryResponse = z.infer<typeof SummaryResponse>;
