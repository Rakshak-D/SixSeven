import { beforeAll, describe, expect, it } from "vitest";
import { app } from "@/server/app";
import { ErrorResponse } from "@/shared/errors";
import { testDatabase } from "./database-fixture";

beforeAll(() => {
  testDatabase();
});

describe("meta routes", () => {
  it("GET /health reports the app and the DB as up", async () => {
    const res = await app.request("/api/v1/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: "up" });
  });

  it("serves the OpenAPI document", async () => {
    const res = await app.request("/api/v1/doc");
    expect(res.status).toBe(200);
    expect((await res.json()).openapi).toBe("3.0.0");
  });

  it("unknown routes use the standard error shape", async () => {
    const res = await app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("NOT_FOUND");
  });
});
