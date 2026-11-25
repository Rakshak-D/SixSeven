import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { signIn, signOut } from "./auth";
import { ApiClientError, api } from "./client";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const sent = (fetchMock: ReturnType<typeof stubFetch>) =>
  (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];

afterEach(() => vi.unstubAllGlobals());

describe("api transport", () => {
  it("sends JSON with a JSON content type", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    await api("POST", "/x", { body: { a: 1 }, schema: z.object({ ok: z.boolean() }) });
    expect(sent(fetchMock).headers).toEqual({ "content-type": "application/json" });
    expect(sent(fetchMock).body).toBe('{"a":1}');
  });

  it("sends a FormData body as is, with no content type so the browser sets the boundary", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const form = new FormData();
    form.set("note", "hello");
    await api("POST", "/x", { body: form });
    expect(sent(fetchMock).body).toBe(form);
    expect(sent(fetchMock).headers).toBeUndefined();
  });

  it("turns an error body into an ApiClientError with the API's message", async () => {
    stubFetch(409, { error: { code: "CONFLICT", message: "Already done" } });
    await expect(api("POST", "/x")).rejects.toMatchObject({
      status: 409,
      code: "CONFLICT",
      message: "Already done",
    });
  });
});

describe("auth", () => {
  it("signs in with credentials included and returns the user", async () => {
    const fetchMock = stubFetch(200, {
      redirect: false,
      user: { id: "u1", name: "Demo Owner", email: "owner@demo.invalid" },
    });
    const result = await signIn("owner@demo.invalid", "pw");
    expect(result.user.email).toBe("owner@demo.invalid");
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("/api/auth/sign-in/email");
    expect(sent(fetchMock).credentials).toBe("include");
  });

  it("says wrong credentials without saying which part was wrong", async () => {
    stubFetch(401, { message: "Invalid email or password", code: "INVALID_EMAIL_OR_PASSWORD" });
    await expect(signIn("a@b.co", "bad")).rejects.toThrow("That email and password don't match.");
  });

  it("reports a failed sign-out", async () => {
    stubFetch(500, {});
    await expect(signOut()).rejects.toBeInstanceOf(ApiClientError);
  });
});
