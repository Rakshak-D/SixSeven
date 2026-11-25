import { z } from "zod";
import { HalfDays, Id, PositivePaise, Qty, Timestamp } from "./common";

const reason = z.string().trim().min(10).max(2_000);
const target = { targetId: Id, reason };
const record = { ...target, id: Id, createdAt: Timestamp, actorId: Id };
export const CreateAdjustmentInput = z.discriminatedUnion("targetTable", [
  z.strictObject({ ...target, targetTable: z.literal("stock_movements"), newValue: Qty }),
  z.strictObject({ ...target, targetTable: z.literal("attendance"), newValue: HalfDays }),
  z.strictObject({ ...target, targetTable: z.literal("wage_payments"), newValue: PositivePaise }),
]);
export const AdjustmentResponse = z.discriminatedUnion("targetTable", [
  z.strictObject({
    ...record,
    targetTable: z.literal("stock_movements"),
    oldValue: Qty,
    newValue: Qty,
  }),
  z.strictObject({
    ...record,
    targetTable: z.literal("attendance"),
    oldValue: HalfDays,
    newValue: HalfDays,
  }),
  z.strictObject({
    ...record,
    targetTable: z.literal("wage_payments"),
    oldValue: PositivePaise,
    newValue: PositivePaise,
  }),
]);

export type CreateAdjustmentInput = z.infer<typeof CreateAdjustmentInput>;
export type AdjustmentResponse = z.infer<typeof AdjustmentResponse>;
