import { z } from "zod";
import { Id, IsoDate, Label, Note, Paise, PositivePaise, SignedPaise, Timestamp } from "./common";

const PaymentKind = z.enum(["wage", "advance"]);
export const WagePaymentMode = z.enum(["cash", "upi", "bank", "cheque"]);
const payment = {
  workerId: Id,
  amountPaise: PositivePaise,
  kind: PaymentKind,
  mode: WagePaymentMode,
  paidOn: IsoDate,
};
const paymentReferences = {
  upi: { pattern: /^[0-9]{12}$/, message: "Enter a 12-digit UPI transaction reference" },
  bank: {
    pattern: /^[A-Za-z0-9]{6,22}$/,
    message: "Enter a 6–22 character alphanumeric bank reference",
  },
  cheque: { pattern: /^[0-9]{6}$/, message: "Enter a 6-digit cheque number" },
};
export const CreateWagePaymentInput = z
  .strictObject({
    ...payment,
    note: Note,
    reference: Label.optional().describe(
      "UPI: 12 digits. Bank: 6–22 alphanumeric characters. Cheque: 6 digits. Cash: omit.",
    ),
  })
  .superRefine(({ mode, reference }, ctx) => {
    if (mode === "cash") {
      if (reference)
        ctx.addIssue({
          code: "custom",
          path: ["reference"],
          message: "Cash payments do not use a reference",
        });
      return;
    }
    const { pattern, message } = paymentReferences[mode];
    if (!reference || !pattern.test(reference))
      ctx.addIssue({ code: "custom", path: ["reference"], message });
  });
export const WagePaymentResponse = z.strictObject({
  id: Id,
  ...payment,
  reference: Label.nullable(),
  note: Note.nullable().optional(),
});
export const WageSheetQuery = z
  .strictObject({
    from: IsoDate,
    to: IsoDate,
    format: z.enum(["json", "csv", "pdf"]).optional(),
  })
  .refine(({ from, to }) => from <= to, {
    path: ["to"],
    message: "End date must be on or after start date",
  });

const totals = {
  accruedPaise: Paise,
  paidWagesPaise: Paise,
  advancesPaise: Paise,
  duePaise: SignedPaise,
};
export const WageSheetResponse = z.strictObject({
  from: IsoDate,
  to: IsoDate,
  workers: z.array(
    z.strictObject({ workerId: Id, name: Label, halfDays: z.int().nonnegative(), ...totals }),
  ),
  totals: z.strictObject(totals),
});
export const WageExportContentType = { csv: "text/csv", pdf: "application/pdf" } as const;

export type CreateWagePaymentInput = z.infer<typeof CreateWagePaymentInput>;
export type WagePaymentMode = z.infer<typeof WagePaymentMode>;
export type WagePaymentResponse = z.infer<typeof WagePaymentResponse>;
export type WageSheetQuery = z.infer<typeof WageSheetQuery>;
export type WageSheetResponse = z.infer<typeof WageSheetResponse>;

export const WagePaymentListQuery = z
  .strictObject({ from: IsoDate.optional(), to: IsoDate.optional(), workerId: Id.optional() })
  .refine(({ from, to }) => !from || !to || from <= to, {
    path: ["to"],
    message: "End date must be on or after start date",
  });
export const WagePaymentRecord = WagePaymentResponse.extend({
  effectiveAmountPaise: PositivePaise,
  createdAt: Timestamp,
});
export const WagePaymentListResponse = z.array(WagePaymentRecord);
export type WagePaymentListQuery = z.infer<typeof WagePaymentListQuery>;
export type WagePaymentRecord = z.infer<typeof WagePaymentRecord>;
export type WagePaymentListResponse = z.infer<typeof WagePaymentListResponse>;
