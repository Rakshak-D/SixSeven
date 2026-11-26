import {
  BinaryBitmap,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";

export function decodeBagBarcode(pixels: Uint8ClampedArray, width: number, height: number) {
  const luminance = new Uint8ClampedArray(width * height);
  for (let i = 0; i < luminance.length; i++) {
    const channel = i * 4;
    luminance[i] = (pixels[channel] + 2 * pixels[channel + 1] + pixels[channel + 2]) / 4;
  }
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(luminance, width, height)),
  );
  try {
    return new MultiFormatReader().decode(bitmap, new Map()).getText();
  } catch {
    // A live camera often has no readable code in the current frame.
    return null;
  }
}
