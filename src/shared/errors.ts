import { z } from "zod";
import { Id, Qty } from "./schemas/common";

/** Every error code the API can return. Add new codes here, never inline strings. */
export const ErrorCode = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INSUFFICIENT_STOCK: "INSUFFICIENT_STOCK",
  DUPLICATE_CHALLAN: "DUPLICATE_CHALLAN",
  BAG_CODE_UNKNOWN: "BAG_CODE_UNKNOWN",
  BAG_CODE_USED: "BAG_CODE_USED",
  BAG_CODE_WRONG_MATERIAL: "BAG_CODE_WRONG_MATERIAL",
  STEEL_PROOF_REQUIRED: "STEEL_PROOF_REQUIRED",
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

export const InsufficientStockErrorResponse = z.strictObject({
  error: z.strictObject({
    code: z.literal(ErrorCode.INSUFFICIENT_STOCK),
    message: z.string(),
    details: z.strictObject({ materialId: Id, balance: Qty }),
  }),
});
export type InsufficientStockErrorResponse = z.infer<typeof InsufficientStockErrorResponse>;
