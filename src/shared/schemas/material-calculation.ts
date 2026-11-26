import { z } from "zod";

const dimension = z.strictObject({
  value: z.number().positive().max(10000),
  unit: z.enum(["m", "cm", "mm", "ft", "in"]),
});
export const MaterialCalculationInput = z.strictObject({
  dimensions: z.tuple([dimension, dimension, dimension]),
  mixRatio: z.tuple([
    z.number().min(0.001).max(100),
    z.number().min(0.001).max(100),
    z.number().min(0.001).max(100),
  ]),
  wasteMarginPercent: z.number().min(0).max(50).default(5),
});
export const MaterialCalculationResponse = z.strictObject({
  source: z.literal("deterministic"),
  wetVolumeM3: z.number().positive(),
  cementBags50Kg: z.int().positive(),
  sandM3: z.number().positive(),
  aggregateM3: z.number().positive(),
  assumptions: z.array(z.string()),
});
export type MaterialCalculationInput = z.infer<typeof MaterialCalculationInput>;
export type MaterialCalculationResponse = z.infer<typeof MaterialCalculationResponse>;
