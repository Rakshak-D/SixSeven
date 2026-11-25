import type { ZodType } from "zod";
import { ApiClientError } from "./client";

/** Checks a request body with its input schema, failing the way the API's 400 would. */
export function failIfInvalid<T>(schema: ZodType<T>, value: unknown) {
  const checked = schema.safeParse(value);
  if (checked.success) return checked.data;
  throw new ApiClientError(
    400,
    "VALIDATION_ERROR",
    checked.error.issues[0]?.message ?? "Check the form",
    checked.error.issues,
  );
}
