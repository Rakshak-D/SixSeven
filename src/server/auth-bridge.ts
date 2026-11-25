import type { ZodType } from "zod";
import {
  SessionResponse,
  SignInInput,
  SignInResponse,
  SignOutInput,
  SignOutResponse,
} from "@/shared/schemas/auth";
import { getAuth } from "./auth";

const noStore = "private, no-store";
function errorResponse(status: number, code: string, message: string, cookies: string[] = []) {
  const headers = new Headers({ "Cache-Control": noStore });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return Response.json({ code, message }, { status, headers });
}

const routes = new Map<string, { input?: ZodType; output: ZodType }>([
  ["POST /api/auth/sign-in/email", { input: SignInInput, output: SignInResponse }],
  ["POST /api/auth/sign-out", { input: SignOutInput, output: SignOutResponse }],
  ["GET /api/auth/get-session", { output: SessionResponse }],
]);

export async function authHandler(request: Request) {
  const url = new URL(request.url);
  const route = routes.get(`${request.method} ${url.pathname}`);
  if (!route) return errorResponse(404, "NOT_FOUND", "Not found");
  if (url.search) return errorResponse(400, "VALIDATION_ERROR", "Unexpected query parameters");

  if (route.input) {
    try {
      // Next can supply an empty stream for a browser POST with no body.
      const text = request.body ? await request.clone().text() : "";
      if (
        text !== "" &&
        request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !==
          "application/json"
      ) {
        return errorResponse(400, "VALIDATION_ERROR", "Expected an application/json body");
      }
      const body: unknown = text === "" ? undefined : JSON.parse(text);
      if (!route.input.safeParse(body).success) {
        return errorResponse(400, "VALIDATION_ERROR", "Invalid input");
      }
    } catch {
      return errorResponse(400, "VALIDATION_ERROR", "Invalid JSON");
    }
  }

  try {
    const auth = getAuth();
    const native = await auth.handler(request);
    const headers = new Headers(native.headers);
    headers.set("Cache-Control", noStore);
    if (!native.ok) return new Response(native.body, { status: native.status, headers });

    const cookies = native.headers.getSetCookie();
    const parsed = route.output.safeParse(await native.json());
    if (!parsed.success)
      return errorResponse(500, "INTERNAL", "Unexpected authentication response");

    if (url.pathname === "/api/auth/sign-out") {
      // The native sign-out handler may report success even if session deletion failed.
      // Read the same cookie via a GET with refresh disabled before acknowledging logout.
      try {
        const session = await auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true, disableRefresh: true },
        });
        if (session)
          return errorResponse(500, "INTERNAL", "Unable to invalidate the session", cookies);
      } catch {
        return errorResponse(500, "INTERNAL", "Unable to invalidate the session", cookies);
      }
    }

    // Preserve each Set-Cookie line. The body has changed, so native entity headers no longer apply.
    headers.delete("Set-Cookie");
    for (const cookie of cookies) headers.append("Set-Cookie", cookie);
    headers.delete("Content-Length");
    return Response.json(parsed.data, { status: native.status, headers });
  } catch {
    return errorResponse(500, "INTERNAL", "Authentication unavailable");
  }
}
