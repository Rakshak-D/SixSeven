import { z } from "zod";
import {
  Id,
  IsoDate,
  Label,
  Note,
  Paise,
  PositivePaise,
  PositiveQty,
  Qty,
  Timestamp,
} from "./common";

const Account = z
  .string()
  .trim()
  .regex(/^[0-9]{9,18}$/);
const Gstin = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[0-9]{2}[A-Z0-9]{13}$/);
export const SupplierNoteInput = z.strictObject({ note: Note });
export const CreateSupplierInput = SupplierNoteInput.extend({
  name: Label,
  gstin: Gstin,
  account: Account,
});
export const ChangeSupplierBankInput = SupplierNoteInput.extend({ account: Account });
export const SupplierAutopay = z.strictObject({
  enabled: z.boolean(),
  paused: z.boolean(),
  perBillCapPaise: Paise,
  perWeekCapPaise: Paise,
});
export const SetSupplierAutopayInput = SupplierAutopay.extend({ note: Note }).refine(
  (rule) =>
    !rule.enabled || (rule.perBillCapPaise > 0 && rule.perWeekCapPaise >= rule.perBillCapPaise),
  {
    path: ["perWeekCapPaise"],
    message: "Enabled autopay requires a positive bill cap and a weekly cap at least as large",
  },
);
export const PauseSupplierPaymentsInput = SupplierNoteInput.extend({ paused: z.boolean() });
export const CreateSupplierOrderInput = SupplierNoteInput.extend({
  supplierId: Id,
  materialId: Id,
  qty: PositiveQty,
  maxUnitPricePaise: PositivePaise,
});
export const DecideSupplierPaymentInput = SupplierNoteInput.extend({ approve: z.boolean() });
export const ApproveSupplierPaymentsInput = SupplierNoteInput.extend({
  ids: z
    .array(Id)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
const last4 = z.string().regex(/^[0-9]{4}$/);
export const SupplierResponse = z.strictObject({
  id: Id,
  name: Label,
  gstin: Gstin,
  accountLast4: last4,
  approved: z.boolean(),
  autopay: SupplierAutopay,
  bankChange: z
    .strictObject({
      accountLast4: last4,
      requestedAt: Timestamp,
      effectiveAt: Timestamp.nullable(),
    })
    .nullable(),
});
export const SupplierOrderResponse = z.strictObject({
  id: Id,
  supplierId: Id,
  materialId: Id,
  qty: PositiveQty,
  remainingQty: Qty,
  maxUnitPricePaise: PositivePaise,
});
export const SupplierPaymentStatus = z.enum(["pending", "paid", "declined"]);
export const SupplierPaymentResponse = z.strictObject({
  provider: z.literal("mock"),
  id: Id,
  deliveryId: Id,
  supplierName: Label,
  materialId: Id,
  qty: PositiveQty,
  unitPricePaise: Paise,
  occurredOn: IsoDate,
  verifiedNote: Note,
  status: SupplierPaymentStatus,
  amountPaise: Paise,
  heldBecause: z.string().nullable(),
  paidBy: z.enum(["autopay", "owner", "delegate"]).nullable(),
  decidedAt: Timestamp.nullable(),
  decisionNote: Note.nullable(),
});
export const SupplierPaymentsQuery = z.strictObject({ status: SupplierPaymentStatus.optional() });
export const SupplierPaymentsResponse = z.array(SupplierPaymentResponse);
export const SuppliersResponse = z.array(SupplierResponse);
export const SupplierPaymentsOverview = z.strictObject({
  provider: z.literal("mock"),
  paused: z.boolean(),
  suppliers: SuppliersResponse,
  orders: z.array(SupplierOrderResponse),
  payments: SupplierPaymentsResponse,
});
export const SupplierWriteResponse = z.strictObject({
  ok: z.literal(true),
  provider: z.literal("mock"),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierInput>;
export type SupplierResponse = z.infer<typeof SupplierResponse>;
export type SupplierAutopay = z.infer<typeof SupplierAutopay>;
export type SetSupplierAutopayInput = z.infer<typeof SetSupplierAutopayInput>;
export type ChangeSupplierBankInput = z.infer<typeof ChangeSupplierBankInput>;
export type CreateSupplierOrderInput = z.infer<typeof CreateSupplierOrderInput>;
export type SupplierOrderResponse = z.infer<typeof SupplierOrderResponse>;
export type DecideSupplierPaymentInput = z.infer<typeof DecideSupplierPaymentInput>;
export type ApproveSupplierPaymentsInput = z.infer<typeof ApproveSupplierPaymentsInput>;
export type SupplierPaymentsQuery = z.infer<typeof SupplierPaymentsQuery>;
export type SupplierPaymentResponse = z.infer<typeof SupplierPaymentResponse>;
export type SupplierPaymentsOverview = z.infer<typeof SupplierPaymentsOverview>;

export const ChangeSupplierDelegationInput = z.discriminatedUnion("action", [
  SupplierNoteInput.extend({ action: z.literal("grant"), engineerId: Id, capPaise: PositivePaise }),
  SupplierNoteInput.extend({ action: z.literal("revoke") }),
]);
export type ChangeSupplierDelegationInput = z.infer<typeof ChangeSupplierDelegationInput>;
export const SupplierDelegationResponse = z
  .strictObject({ engineerId: Id, capPaise: PositivePaise, remainingPaise: Paise })
  .nullable();
export const DelegatedPaymentsResponse = z.array(
  z.strictObject({ id: Id, supplierName: Label, amountPaise: PositivePaise }),
);
