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

export type BrickworkInput = {
  lengthM: number;
  heightM: number;
  thicknessM: number;
  brickMm: [number, number, number];
  jointMm: number;
  mortarRatio: number;
  wastagePercent: number;
};

/**
 * Bricks and cement mortar for a solid wall. Each brick plus its joint occupies
 * (l + j)(w + j)(h + j); mortar is the wall volume the bricks leave, with a dry-volume factor of 1.33.
 */
export function calculateBrickwork(input: BrickworkInput) {
  const wall = input.lengthM * input.heightM * input.thicknessM;
  if (!(wall > 0 && wall <= 10000)) throw new Error("Wall volume must be between 0 and 10000 m³");
  const [l, w, h] = input.brickMm.map((mm) => mm / 1000);
  const j = input.jointMm / 1000;
  const withJoint = (l + j) * (w + j) * (h + j);
  const bricksExact = wall / withJoint;
  const waste = 1 + input.wastagePercent / 100;
  const mortarWet = Math.max(wall - bricksExact * l * w * h, 0);
  const mortarDry = mortarWet * 1.33 * waste;
  const cementM3 = mortarDry / (1 + input.mortarRatio);
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return {
    wallVolumeM3: round(wall),
    bricks: Math.ceil(bricksExact * waste),
    mortarWetM3: round(mortarWet),
    cementBags50Kg: Math.ceil(cementM3 / 0.035),
    sandM3: round(cementM3 * input.mortarRatio),
    assumptions: [
      `Brick ${input.brickMm.join(" × ")} mm with ${input.jointMm} mm joints; solid wall, no openings deducted.`,
      `Cement mortar 1:${input.mortarRatio}, dry-volume factor 1.33, one 50 kg bag = 0.035 m³.`,
      `Wastage: ${input.wastagePercent}% on bricks and mortar.`,
    ],
  };
}
