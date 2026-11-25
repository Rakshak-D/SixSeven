import { z } from "zod";

/** Integer paise, never negative unless a schema says otherwise. */
export const Paise = z.number().int().nonnegative();

/** Material quantity: up to 3 decimals (NUMERIC(14,3) in the DB). */
export const Qty = z
  .number()
  .nonnegative()
  .refine(
    (n) =>
      Number.isInteger(Math.round(n * 1000)) && Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6,
    {
      message: "At most 3 decimals",
    },
  );

/** Calendar date as YYYY-MM-DD (IST site day). */
export const IsoDate = z.iso.date();

export const Role = z.enum(["owner", "contractor", "engineer"]);
export type Role = z.infer<typeof Role>;
