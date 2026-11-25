import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import * as schema from "@/db/auth-schema";
import { type Db, getDatabase, type Transaction } from "@/db/client";

export function authOrigin() {
  const value = process.env.BETTER_AUTH_URL;
  const url = value ? URL.parse(value) : null;
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error(
      "Set BETTER_AUTH_URL to the canonical application origin (HTTPS in production)",
    );
  }
  return url.origin;
}

export function createAuth(db: Db | Transaction, { provisioning = false } = {}) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-with-")) {
    throw new Error("Set BETTER_AUTH_SECRET to a generated secret of at least 32 characters");
  }
  const baseURL = authOrigin();
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema, transaction: true }),
    baseURL,
    basePath: "/api/auth",
    secret,
    trustedOrigins: [baseURL],
    advanced: {
      useSecureCookies: baseURL.startsWith("https:"),
      // Better Auth skips origin checks by default in test mode.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    emailAndPassword: { enabled: true, disableSignUp: !provisioning, autoSignIn: false },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: process.env.NODE_ENV === "production" },
    telemetry: { enabled: false },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  auth ??= createAuth(getDatabase().db);
  return auth;
}
