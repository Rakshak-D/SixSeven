import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { InsufficientStockErrorResponse } from "@/shared/errors";
import { CreateUsageInput, UsageResponse } from "@/shared/schemas/usages";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { recordUsage } from "../services/stock-ledger";

export const usages = createRouter<AuthEnv>().openapi(
  createRoute({
    method: "post",
    path: "/projects/{id}/usages",
    tags: ["usages"],
    middleware: projectAuth,
    request: projectBody(CreateUsageInput),
    responses: {
      201: { description: "Usage recorded", content: json(UsageResponse) },
      ...projectErrors,
      409: { description: "Insufficient stock", content: json(InsufficientStockErrorResponse) },
    },
  }),
  async (c) =>
    c.json(
      await recordUsage(
        getDatabase().db,
        c.get("actor"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
      201,
    ),
);
