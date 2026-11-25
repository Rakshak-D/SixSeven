import { expect, it } from "vitest";
import { app } from "@/server/app";

it("publishes the M4 labour and wage-sheet operations", async () => {
  const response = await app.request("/api/v1/doc");
  expect(response.status).toBe(200);
  const { paths } = await response.json();
  expect(paths["/api/v1/projects/{id}/attendance"]).toHaveProperty("get");
  expect(paths["/api/v1/projects/{id}/attendance"]).toHaveProperty("post");
  expect(paths["/api/v1/projects/{id}/wage-payments"]).toHaveProperty("get");
  expect(paths["/api/v1/projects/{id}/wage-payments"]).toHaveProperty("post");
  expect(paths["/api/v1/projects/{id}/adjustments"]).toHaveProperty("get");
  expect(paths["/api/v1/projects/{id}/adjustments"]).toHaveProperty("post");
  expect(paths["/api/v1/projects/{id}/wage-sheet"]).toHaveProperty("get");
});
