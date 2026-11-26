import { z } from "zod";
import { Id, IsoDate, Label, Note, Paise, PositiveQty, Qty, Timestamp } from "./common";
import { CaptureTimestamp, PhotoFile, PhotoResponse } from "./progress";

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

export const CreateExpectedDeliveryInput = z.strictObject({
  materialId: Id,
  qty: PositiveQty,
  supplier: Label,
  expectedOn: IsoDate,
  note: Note.optional(),
});
export const RejectExpectedDeliveryInput = z.strictObject({
  reason: Note.min(10),
  newDate: IsoDate.optional(),
});
export const ExpectedDeliveryStatus = z.enum(["pending", "accepted", "rejected"]);
export const ExpectedDeliveriesQuery = z.strictObject({
  status: z.union([ExpectedDeliveryStatus, z.literal("all")]).optional(),
});
export const ExpectedDeliveryResponse = CreateExpectedDeliveryInput.extend({
  id: Id,
  note: Note.nullable(),
  status: ExpectedDeliveryStatus,
  deliveryId: Id.nullable(),
  rejectionReason: RejectExpectedDeliveryInput.shape.reason.nullable(),
  rescheduledOn: IsoDate.nullable(),
  decidedAt: Timestamp.nullable(),
  createdAt: Timestamp,
});
export const ExpectedDeliveriesResponse = z.array(ExpectedDeliveryResponse);
export const ChallanPhotoParams = z.strictObject({ id: Id, deliveryId: Id });
export const CreateChallanPhotoInput = z.strictObject({
  photo: PhotoFile,
  capturedAt: CaptureTimestamp,
});
export const ChallanPhotoResponse = PhotoResponse.omit({ id: true, takenOn: true }).extend({
  deliveryId: Id,
  createdAt: Timestamp,
});
export type CreateExpectedDeliveryInput = z.infer<typeof CreateExpectedDeliveryInput>;
export type RejectExpectedDeliveryInput = z.infer<typeof RejectExpectedDeliveryInput>;
export type ExpectedDeliveriesQuery = z.infer<typeof ExpectedDeliveriesQuery>;
export type ExpectedDeliveryResponse = z.infer<typeof ExpectedDeliveryResponse>;
export type ChallanPhotoResponse = z.infer<typeof ChallanPhotoResponse>;

export const BagCode = z.string().trim().min(1).max(160);
export const BagCodes = z
  .array(BagCode)
  .max(5000)
  .refine((codes) => new Set(codes).size === codes.length, "Bag codes must be unique");
export const VerifyDeliveryInput = z.strictObject({ note: Note, codes: BagCodes.optional() });
export const RegisterBagCodesInput = z.strictObject({ codes: BagCodes, note: Note.optional() });
export const DeliveryVerificationResponse = z.strictObject({
  ok: z.literal(true),
  deliveryId: Id,
  verifiedBy: Id,
  verifiedAt: Timestamp,
  bagCodeCount: z.int().nonnegative(),
});
export const DeliveryVerificationQueue = z.array(
  z.strictObject({
    deliveryId: Id,
    materialName: Label,
    unit: Label,
    qty: PositiveQty,
    supplier: Label,
    challanNo: Label,
    occurredOn: IsoDate,
    tracksBags: z.boolean(),
  }),
);
export type VerifyDeliveryInput = z.infer<typeof VerifyDeliveryInput>;
export type RegisterBagCodesInput = z.infer<typeof RegisterBagCodesInput>;
export type DeliveryVerificationResponse = z.infer<typeof DeliveryVerificationResponse>;
export type DeliveryVerificationQueue = z.infer<typeof DeliveryVerificationQueue>;
