import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import { SummaryResponse } from "@/shared/schemas/summary";
import { json, projectAuth, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { getProjectSummary } from "../services/summary";

export const summary = createRouter<AuthEnv>().openapi(
  createRoute({
    method: "get",
    path: "/projects/{id}/summary",
    tags: ["summary"],
    middleware: projectAuth,
    request: { params: IdParams },
    responses: {
      200: {
        description: "Project financial and material summary",
        content: json(SummaryResponse),
      },
      ...projectErrors,
      409: { description: "Aggregate exceeds the supported range", content: json(ErrorResponse) },
    },
  }),
  async (c) =>
    c.json(await getProjectSummary(getDatabase().db, c.get("actor"), c.req.valid("param").id), 200),
);
