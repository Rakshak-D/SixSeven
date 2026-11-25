import { createMiddleware } from "hono/factory";
import { authOrigin, getAuth } from "@/server/auth";
import { ErrorCode } from "@/shared/errors";
import { ApiError } from "./errors";

export type Actor = { userId: string };
export type AuthEnv = { Variables: { actor: Actor } };

export const requireActor = createMiddleware<AuthEnv>(async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const session = await getAuth().api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session) throw new ApiError(401, ErrorCode.UNAUTHENTICATED, "Sign in to continue");

  const origin = c.req.header("Origin");
  if (!["GET", "HEAD"].includes(c.req.method) && origin && origin !== authOrigin()) {
    throw new ApiError(403, ErrorCode.FORBIDDEN, "Invalid request origin");
  }
  c.set("actor", { userId: session.user.id });
  await next();
});
