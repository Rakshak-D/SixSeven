import { AuthErrorResponse, SignInResponse } from "@/shared/schemas/auth";
import { ApiClientError } from "./client";

const AUTH = "/api/auth";

/** Sign in with email and password; the session is the signed cookie the bridge sets. */
export async function signIn(email: string, password: string) {
  const res = await fetch(`${AUTH}/sign-in/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data: unknown = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const err = AuthErrorResponse.safeParse(data);
    // Wrong credentials are the common case; say it plainly without hinting which part was wrong.
    const message =
      res.status === 401
        ? "That email and password don't match."
        : err.success
          ? err.data.message
          : "Could not sign in. Try again.";
    throw new ApiClientError(res.status, err.success ? (err.data.code ?? "AUTH") : "AUTH", message);
  }
  return SignInResponse.parse(data);
}

export async function signOut() {
  const res = await fetch(`${AUTH}/sign-out`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new ApiClientError(res.status, "AUTH", "Could not sign out. Try again.");
}
