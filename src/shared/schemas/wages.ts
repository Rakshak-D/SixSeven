import { z } from "zod";
import { Id, IsoDate, Label, Paise, PositivePaise, SignedPaise } from "./common";

const PaymentKind = z.enum(["wage", "advance"]);
const PaymentMode = z.enum(["cash", "upi", "bank"]);
const payment = {
  workerId: Id,
  amountPaise: PositivePaise,
  kind: PaymentKind,
  mode: PaymentMode,
  paidOn: IsoDate,
};
export const CreateWagePaymentInput = z.strictObject({ ...payment, reference: Label.optional() });
export const WagePaymentResponse = z.strictObject({
  id: Id,
  ...payment,
  reference: Label.nullable(),
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
export type WagePaymentResponse = z.infer<typeof WagePaymentResponse>;
export type WageSheetQuery = z.infer<typeof WageSheetQuery>;
export type WageSheetResponse = z.infer<typeof WageSheetResponse>;
