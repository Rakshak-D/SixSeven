import { z } from "zod";
import { Id, Label, Paise, Qty } from "./common";

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
  z.strictObject({ ...summary, role: z.literal("engineer") }),
  z.strictObject({ ...summary, role: z.enum(["owner", "contractor"]), spendSplit }),
]);

export type SummaryResponse = z.infer<typeof SummaryResponse>;
