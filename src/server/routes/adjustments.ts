import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import {
  AdjustmentListQuery,
  AdjustmentListResponse,
  AdjustmentResponse,
  CreateAdjustmentInput,
} from "@/shared/schemas/adjustments";
import { IdParams } from "@/shared/schemas/common";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { createAdjustment, listAdjustments } from "../services/adjustments";

export const adjustments = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/adjustments",
      tags: ["adjustments"],
      middleware: projectAuth,
      request: projectBody(CreateAdjustmentInput),
      responses: {
        201: { description: "Correction appended", content: json(AdjustmentResponse) },
        ...projectErrors,
        409: {
          description: "No-op correction or insufficient compensating stock",
          content: json(ErrorResponse),
        },
      },
    }),
    async (c) =>
      c.json(
        await createAdjustment(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        201,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/adjustments",
      tags: ["adjustments"],
      middleware: projectAuth,
      request: { params: IdParams, query: AdjustmentListQuery },
      responses: {
        200: { description: "Effective correction history", content: json(AdjustmentListResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await listAdjustments(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
        200,
      ),
  );
