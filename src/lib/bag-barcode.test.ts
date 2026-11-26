import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import { expect, it } from "vitest";
import { decodeBagBarcode } from "./bag-barcode";

it("decodes a QR image without a native BarcodeDetector", () => {
  const size = 160;
  const matrix = new QRCodeWriter().encode(
    "SLATE-BAG-0001",
    BarcodeFormat.QR_CODE,
    size,
    size,
    new Map(),
  );
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!matrix.get(x, y)) continue;
      const p = (y * size + x) * 4;
      pixels.fill(0, p, p + 3);
    }
  }
  expect(decodeBagBarcode(pixels, size, size)).toBe("SLATE-BAG-0001");
  pixels.fill(255);
  expect(decodeBagBarcode(pixels, size, size)).toBeNull();
});
