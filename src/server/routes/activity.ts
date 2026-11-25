import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ActivityResponse } from "@/shared/schemas/activity";
import { IdParams } from "@/shared/schemas/common";
import { json, projectAuth, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { listProjectActivity } from "../services/activity";

export const activity = createRouter<AuthEnv>().openapi(
  createRoute({
    method: "get",
    path: "/projects/{id}/activity",
    tags: ["activity"],
    middleware: projectAuth,
    request: { params: IdParams },
    responses: {
      200: {
        description: "Allowlisted project activity, newest first",
        content: json(ActivityResponse),
      },
      ...projectErrors,
    },
  }),
  async (c) =>
    c.json(
      await listProjectActivity(getDatabase().db, c.get("actor"), c.req.valid("param").id),
      200,
    ),
);
