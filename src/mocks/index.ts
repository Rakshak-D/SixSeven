/**
 * Frontend mocks, one entry per API route that is not live yet.
 * The API client answers from here when NEXT_PUBLIC_USE_MOCKS=1 and the route is listed.
 * Delete an entry the moment docs/API.md marks its route `live`.
 * Fixtures must pass the route's shared Zod schema (src/shared/schemas/*).
 */
export type MockRoute = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path after /api/v1, with :params, e.g. "/projects/:id/stock". */
  path: string;
  respond: (ctx: { params: Record<string, string>; body: unknown }) => unknown;
};

export const mocks: MockRoute[] = [];
