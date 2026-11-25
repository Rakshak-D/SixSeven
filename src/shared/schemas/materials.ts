import { z } from "zod";
import { Id, Label, Paise, Qty } from "./common";

const MaterialFields = {
  name: Label,
  unit: z.string().trim().min(1).max(24),
  plannedQty: Qty,
  unitCostPaise: Paise,
  tolerancePct: z.number().min(0).max(100),
  lowStockQty: Qty,
};
export const CreateMaterialInput = z.strictObject(MaterialFields);
export const MaterialResponse = z.strictObject({ id: Id, ...MaterialFields });
export const MaterialsResponse = z.array(MaterialResponse);

export type CreateMaterialInput = z.infer<typeof CreateMaterialInput>;
export type MaterialResponse = z.infer<typeof MaterialResponse>;
export type MaterialsResponse = z.infer<typeof MaterialsResponse>;
