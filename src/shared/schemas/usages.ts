import { z } from "zod";
import { Id, IsoDate, Note, PositiveQty, Qty } from "./common";
import { BagCodes } from "./deliveries";

export const CreateUsageInput = z.strictObject({
  materialId: Id,
  qty: PositiveQty,
  occurredOn: IsoDate,
  note: Note,
  bagCodes: BagCodes.optional(),
});
export const UsageResponse = z.strictObject({
  id: Id,
  materialId: Id,
  qty: PositiveQty,
  occurredOn: IsoDate,
  note: Note.nullable(),
  balance: Qty,
});

export type CreateUsageInput = z.infer<typeof CreateUsageInput>;
export type UsageResponse = z.infer<typeof UsageResponse>;
