import type { ZodType } from "zod";

export type MockContext = {
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
};

export type MockRoute = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path after /api/v1, with :params, e.g. "/projects/:id/stock". */
  path: string;
  respond: (ctx: MockContext) => unknown;
};

/** Thrown by a mock to answer like the real API's error shape (403 for a role, 404, 409...). */
export class MockError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Parse a request body with the route's shared input schema, answering 400 like the API. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new MockError(
      400,
      "VALIDATION_ERROR",
      result.error.issues[0]?.message ?? "Check the form",
      result.error.issues,
    );
  }
  return result.data;
}

let counter = 0;
/** A new record id that is unique within the session and tied to its project. */
export const mockId = (projectId: string, prefix: string) =>
  `${projectId}-${prefix}n${Date.now().toString(36)}${++counter}`;
