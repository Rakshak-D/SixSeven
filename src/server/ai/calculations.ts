import { ErrorCode } from "@/shared/errors";
import {
  type MaterialCalculationInput,
  MaterialCalculationResponse,
} from "@/shared/schemas/material-calculation";
import { ApiError } from "../middleware/errors";

const metreFactors = { m: 1, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254 };

export function calculateMaterialEstimates(input: MaterialCalculationInput) {
  const wetVolumeM3 = input.dimensions.reduce(
    (volume, { value, unit }) => volume * value * metreFactors[unit],
    1,
  );
  if (wetVolumeM3 < 0.000001 || wetVolumeM3 > 100000) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "Concrete volume must be between 0.000001 and 100000 cubic metres",
    );
  }
  const [cement, sand, aggregate] = input.mixRatio;
  const unitVolume =
    (wetVolumeM3 * 1.54 * (1 + input.wasteMarginPercent / 100)) / (cement + sand + aggregate);
  return MaterialCalculationResponse.parse({
    source: "deterministic",
    wetVolumeM3,
    cementBags50Kg: Math.ceil((unitVolume * cement) / 0.035),
    sandM3: unitVolume * sand,
    aggregateM3: unitVolume * aggregate,
    assumptions: [
      "Rectangular concrete volume with no deductions. Dry-volume factor is 1.54.",
      "One 50 kg cement bag represents 0.035 m³. Bag count rounds up.",
      `Wastage allowance: ${input.wasteMarginPercent}%.`,
      "Indicative quantity estimate only. Have an engineer verify the dimensions, mix design and ordering quantities.",
    ],
  });
}
