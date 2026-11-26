import { ErrorCode } from "@/shared/errors";
import { CaptureTimestamp } from "@/shared/schemas/progress";
import { ApiError } from "../middleware/errors";

const maxAge = 10 * 60 * 1000;
const maxAhead = 30 * 1000;

export function captureTimes(values: string[], photoCount: number, receivedAt: Date) {
  if (values.length !== photoCount) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      "Provide one capturedAt timestamp per photo in upload order",
    );
  }
  return values.map((value) => {
    const parsed = CaptureTimestamp.safeParse(value);
    const time = parsed.success ? Date.parse(parsed.data) : Number.NaN;
    const age = receivedAt.getTime() - time;
    if (!Number.isFinite(time) || age > maxAge || age < -maxAhead) {
      throw new ApiError(
        400,
        ErrorCode.VALIDATION_ERROR,
        "Capture time must be within ten minutes before receipt or 30 seconds ahead",
      );
    }
    return new Date(time);
  });
}
