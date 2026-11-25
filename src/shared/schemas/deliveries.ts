import { z } from "zod";
import { Id, IsoDate, Label, Note, Paise, PositiveQty, Qty } from "./common";

export const CreateDeliveryInput = z.strictObject({
  materialId: Id,
  qty: PositiveQty,
  unitCostPaise: Paise,
  supplier: Label,
  challanNo: Label,
  occurredOn: IsoDate,
  note: Note.optional(),
});
export const DeliveryResponse = z.strictObject({
  id: Id,
  materialId: Id,
  qty: PositiveQty,
  unitCostPaise: Paise,
  supplier: Label,
  challanNo: Label,
  occurredOn: IsoDate,
  note: Note.nullable(),
  balance: Qty,
});

export type CreateDeliveryInput = z.infer<typeof CreateDeliveryInput>;
export type DeliveryResponse = z.infer<typeof DeliveryResponse>;
