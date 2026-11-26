import { expect, it } from "vitest";
import { MaterialCalculationInput } from "@/shared/schemas/material-calculation";
import { calculateBrickwork, calculateMaterialEstimates } from "./calculations";

it("converts mixed units and preserves zero wastage", () => {
  const input = MaterialCalculationInput.parse({
    dimensions: [
      { value: 2, unit: "m" },
      { value: 100, unit: "cm" },
      { value: 500, unit: "mm" },
    ],
    mixRatio: [1, 2, 3],
    wasteMarginPercent: 0,
  });
  const estimate = calculateMaterialEstimates(input);
  expect(estimate.wetVolumeM3).toBe(1);
  expect(estimate.cementBags50Kg).toBe(8);
  expect(estimate.sandM3).toBeCloseTo(1.54 / 3);
  expect(estimate.aggregateM3).toBeCloseTo(0.77);
  expect(calculateMaterialEstimates({ ...input, wasteMarginPercent: 5 }).sandM3).toBeGreaterThan(
    estimate.sandM3,
  );
});

it("counts bricks and mortar for a one-brick wall", () => {
  const wall = calculateBrickwork({
    lengthM: 4,
    heightM: 3,
    thicknessM: 0.23,
    brickMm: [190, 90, 90],
    jointMm: 10,
    mortarRatio: 6,
    wastagePercent: 0,
  });
  // 2.76 m³ of wall at 500 modular bricks per m³.
  expect(wall).toMatchObject({ wallVolumeM3: 2.76, bricks: 1380, mortarWetM3: 0.636 });
  expect(wall.cementBags50Kg).toBe(4);
});
