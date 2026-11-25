export type MockRoute = {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** Path after /api/v1, with :params, e.g. "/projects/:id/stock". */
  path: string;
  respond: (ctx: { params: Record<string, string>; body: unknown }) => unknown;
};
