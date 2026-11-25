import { z } from "zod";

/** Integer paise, never negative unless a schema says otherwise. */
export const SignedPaise = z.int();
export const Paise = SignedPaise.nonnegative();
export const PositivePaise = Paise.positive();
export const DailyRatePaise = PositivePaise.refine((value) => value % 2 === 0, {
  message: "Daily rate must be divisible by two paise",
});

/** Material quantity: up to 3 decimals (NUMERIC(14,3) in the DB). */
const NumericQuantity = z.number().max(99_999_999_999.999);
const hasExactScale = (value: number) => /^-?\d+(\.\d{1,3})?$/.test(String(value));
export const Qty = NumericQuantity.nonnegative().refine(hasExactScale, {
  message: "At most 3 decimals",
});
export const PositiveQty = Qty.refine((value) => value > 0, {
  message: "Quantity must be positive",
});
export const SignedQty = NumericQuantity.min(-99_999_999_999.999).refine(hasExactScale, {
  message: "At most 3 decimals",
});

/** Calendar date as YYYY-MM-DD (IST site day). */
export const IsoDate = z.iso.date();
export const Timestamp = z.iso.datetime({ precision: 3 });
export const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
export const IdParams = z.strictObject({ id: Id });
export const Label = z.string().trim().min(1).max(160);
export const Note = z.string().trim().min(1).max(2_000);
export const HalfDays = z.union([z.literal(0), z.literal(1), z.literal(2)]);

export const Role = z.enum(["owner", "contractor", "engineer"]);
export type Role = z.infer<typeof Role>;
