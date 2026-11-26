import { z } from "zod";
import { Id, Label, Timestamp } from "./common";

export const ActivityResponse = z.array(
  z.strictObject({
    id: Id,
    actor: z.strictObject({ id: Id, name: Label }),
    action: z.enum(["created", "updated", "corrected", "approved", "rejected"]),
    entity: z.enum([
      "project",
      "member",
      "material",
      "worker",
      "delivery",
      "expectedDelivery",
      "supplier",
      "supplierBankChange",
      "supplierOrder",
      "supplierRule",
      "supplierPayment",
      "usage",
      "attendance",
      "wagePayment",
      "adjustment",
      "progress",
      "proposal",
      "checklist",
      "checklistItem",
    ]),
    entityId: Id,
    createdAt: Timestamp,
  }),
);

export type ActivityResponse = z.infer<typeof ActivityResponse>;
