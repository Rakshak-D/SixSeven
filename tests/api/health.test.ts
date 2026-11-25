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

  it("publishes the verified checklist item shape for project reads", async () => {
    const res = await app.request("/api/v1/doc");
    const doc = await res.json();
    const schema =
      doc.paths["/api/v1/projects/{id}/checklists"].get.responses["200"].content["application/json"]
        .schema;
    const item = schema.items.properties.items.items;
    expect(item.required).toEqual(
      expect.arrayContaining(["verificationStatus", "removedAt", "history"]),
    );
    expect(item.properties.verificationStatus.enum).toEqual([
      "todo",
      "doing",
      "waiting",
      "done",
      "sent_back",
    ]);
  });

  it("unknown routes use the standard error shape", async () => {
    const res = await app.request("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(ErrorResponse.parse(await res.json()).error.code).toBe("NOT_FOUND");
  });
});
