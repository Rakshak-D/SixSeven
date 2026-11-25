import type { Hook } from "@hono/zod-openapi";
import type { ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ErrorCode, type ErrorResponse } from "@/shared/errors";

/** Throw this from routes and services; the error handler turns it into the standard shape. */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

const body = (code: ErrorCode, message: string, details?: unknown): ErrorResponse => ({
  error: { code, message, details },
});

/** Zod failures from createRoute validation -> 400 VALIDATION_ERROR. */
// biome-ignore lint/suspicious/noExplicitAny: the hook is shared by every route
export const validationHook: Hook<any, any, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(body(ErrorCode.VALIDATION_ERROR, "Invalid input", result.error.issues), 400);
  }
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof ApiError) {
    return c.json(body(err.code, err.message, err.details), err.status);
  }
  if (err instanceof HTTPException && err.status < 500) {
    const code =
      err.status === 401
        ? ErrorCode.UNAUTHENTICATED
        : err.status === 403
          ? ErrorCode.FORBIDDEN
          : ErrorCode.CONFLICT;
    return c.json(body(code, err.message), err.status);
  }
  const requestId = crypto.randomUUID();
  console.error(`[api] ${requestId}`, err);
  return c.json(body(ErrorCode.INTERNAL, "Something went wrong", { requestId }), 500);
};

export const notFound: NotFoundHandler = (c) => c.json(body(ErrorCode.NOT_FOUND, "Not found"), 404);
