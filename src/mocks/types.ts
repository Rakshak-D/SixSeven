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
