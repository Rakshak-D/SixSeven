import { generateObject } from "ai";
import { z } from "zod";
import { getLanguageModel } from "./client";

export const MaterialCalculationSchema = z.object({
  summary: z.string().describe("A summary of the calculation and assumptions"),
  components: z.array(
    z.object({
      name: z.string().describe("Structural element or task name e.g. Slab, Column, Brick Wall"),
      dimensions: z.string().describe("Stated or assumed dimensions"),
      materials: z.array(
        z.object({
          material: z
            .string()
            .describe("Material name e.g. Cement, Sand, Aggregates, Steel, Bricks"),
          estimatedQuantity: z.number().describe("Calculated quantity value"),
          unit: z.string().describe("Unit of measurement e.g. bags, tons, cu.m, brass, pieces"),
          standardRatio: z.string().optional().describe("Mix ratio e.g. M20 (1:1.5:3), 1:6 mortar"),
          safetyBufferPct: z
            .number()
            .default(5)
            .describe("Wastage / safety buffer applied e.g. 5%"),
        }),
      ),
    }),
  ),
  totalBillOfQuantities: z.array(
    z.object({
      material: z.string(),
      totalQuantity: z.number(),
      unit: z.string(),
    }),
  ),
  practicalNotes: z
    .array(z.string())
    .describe("Engineering tips, curing guidelines, or site cautions"),
});

export type MaterialCalculation = z.infer<typeof MaterialCalculationSchema>;

export interface CalculateMaterialsParams {
  structureType: string;
  dimensionsDescription: string;
  customMixRatio?: string;
  wasteMarginPercent?: number;
  existingStockContext?: string;
}

/**
 * Calculates concrete, masonry, steel, and mortar quantities using construction engineering principles.
 */
export async function calculateMaterialEstimates(
  params: CalculateMaterialsParams,
): Promise<MaterialCalculation | null> {
  const model = getLanguageModel();
  if (!model) {
    return null;
  }

  const prompt = `You are an expert Structural Quantity Surveyor and Construction Cost Estimator.
Calculate the exact required construction material quantities for the following job:
- Structure / Task: ${params.structureType}
- Dimensions / Specs: ${params.dimensionsDescription}
${params.customMixRatio ? `- Target Mix Ratio: ${params.customMixRatio}` : ""}
${params.wasteMarginPercent ? `- Wastage Buffer: ${params.wasteMarginPercent}%` : "- Standard 5-10% wastage allowance"}
${params.existingStockContext ? `- Current Inventory Context: ${params.existingStockContext}` : ""}

Engineering Rules for Calculations:
- Standard dry volume factor for concrete: 1.54 to 1.57 times wet volume.
- Standard cement bag volume = 0.035 cu.m (50 kg).
- Reinforcement steel guideline: ~1% of slab volume (7850 kg/cu.m) or standard schedule if specified.
- Brickwork: standard modular brick calculations with 1:6 or 1:4 mortar.
- Calculate exact component breakdowns and provide a consolidated Bill of Quantities (BOQ).`;

  try {
    const { object } = await generateObject({
      model,
      schema: MaterialCalculationSchema,
      prompt,
    });
    return object;
  } catch (error) {
    console.error("Material Calculation AI Error:", error);
    return null;
  }
}
