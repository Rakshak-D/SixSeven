import { z } from "zod";
import { Id, IsoDate, Label, Note, Paise, PositiveQty, Qty, SignedQty, Timestamp } from "./common";

export const StockResponse = z.array(
  z.strictObject({
    materialId: Id,
    name: Label,
    unit: Label,
    balance: Qty,
    lowStockQty: Qty,
    lowStock: z.boolean(),
  }),
);

export const StockMovementsQuery = z.strictObject({ materialId: Id.optional() });
const movement = {
  id: Id,
  materialId: Id,
  occurredOn: IsoDate,
  createdAt: Timestamp,
  note: Note.nullable(),
};
export const StockMovementResponse = z.discriminatedUnion("type", [
  z.strictObject({
    ...movement,
    type: z.literal("delivery"),
    qty: PositiveQty,
    supplier: Label,
    challanNo: Label,
    unitCostPaise: Paise,
  }),
  z.strictObject({
    ...movement,
    type: z.literal("usage"),
    qty: SignedQty.refine((qty) => qty < 0),
  }),
  z.strictObject({
    ...movement,
    type: z.literal("adjustment"),
    qty: SignedQty.refine((qty) => qty !== 0),
  }),
]);
export const StockMovementsResponse = z.array(StockMovementResponse);

export type StockResponse = z.infer<typeof StockResponse>;
export type StockMovementsQuery = z.infer<typeof StockMovementsQuery>;
export type StockMovementResponse = z.infer<typeof StockMovementResponse>;
export type StockMovementsResponse = z.infer<typeof StockMovementsResponse>;
