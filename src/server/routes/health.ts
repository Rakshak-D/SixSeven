import { createRoute, z } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { createRouter } from "../lib/router";

const Health = z.object({ ok: z.boolean(), db: z.enum(["up", "down"]) });

const route = createRoute({
  method: "get",
  path: "/health",
  tags: ["meta"],
  responses: {
    200: { description: "App is up", content: { "application/json": { schema: Health } } },
  },
});

export const health = createRouter().openapi(route, async (c) => {
  let db: "up" | "down" = "up";
  try {
    await getDatabase().sql`select 1`;
  } catch {
    db = "down";
  }
  return c.json({ ok: true, db }, 200);
});
