import type { ZodType } from "zod";
import { type MockRoute, mocks, mocksEnabled } from "@/mocks";
import { MockError } from "@/mocks/types";
import { ErrorResponse } from "@/shared/errors";

const BASE = "/api/v1";

/** Thrown for every non-2xx response; `message` is safe to show the user. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Method = MockRoute["method"];

function matchMock(method: Method, path: string) {
  const parts = path.split("?")[0].split("/");
  for (const mock of mocks) {
    if (mock.method !== method) continue;
    const pattern = mock.path.split("/");
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const ok = pattern.every((seg, i) => {
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = decodeURIComponent(parts[i]);
        return true;
      }
      return seg === parts[i];
    });
    if (ok) return { mock, params };
  }
  return null;
}

/**
 * Call the API. Pass the response schema from src/shared/schemas so contract drift fails loudly.
 * `path` is relative to /api/v1, e.g. api("GET", `/projects/${id}/stock`, { schema: StockResponse }).
 */
export async function api<T>(
  method: Method,
  path: string,
  opts: { body?: unknown; schema?: ZodType<T> } = {},
): Promise<T> {
  const parse = (data: unknown) => (opts.schema ? opts.schema.parse(data) : (data as T));

  if (mocksEnabled) {
    const hit = matchMock(method, path);
    if (hit) {
      const query = new URLSearchParams(path.split("?")[1] ?? "");
      try {
        return parse(await hit.mock.respond({ params: hit.params, query, body: opts.body }));
      } catch (error) {
        if (error instanceof MockError)
          throw new ApiClientError(error.status, error.code, error.message);
        throw error;
      }
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: opts.body === undefined ? undefined : { "content-type": "application/json" },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: "include",
  });
  const data: unknown = res.headers.get("content-type")?.includes("json") ? await res.json() : null;

  if (!res.ok) {
    const err = ErrorResponse.safeParse(data);
    if (err.success) {
      const { code, message, details } = err.data.error;
      throw new ApiClientError(res.status, code, message, details);
    }
    throw new ApiClientError(res.status, "INTERNAL", "Something went wrong");
  }
  return parse(data);
}
