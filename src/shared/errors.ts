import { z } from "zod";

/** Every error code the API can return. Add new codes here, never inline strings. */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  DUPLICATE_CHALLAN: "DUPLICATE_CHALLAN",
  CONFLICT: "CONFLICT",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The only error shape the API sends: { error: { code, message, details } }. */
export const ErrorResponse = z.object({
  error: z.object({
    code: z.enum(Object.values(ErrorCode) as [ErrorCode, ...ErrorCode[]]),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
