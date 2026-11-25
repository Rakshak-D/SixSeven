import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { IdParams } from "@/shared/schemas/common";
import {
  CreateWagePaymentInput,
  WagePaymentListQuery,
  WagePaymentListResponse,
  WagePaymentResponse,
} from "@/shared/schemas/wages";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { listWagePayments, recordWagePayment } from "../services/wages";

export const wagePayments = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/wage-payments",
      tags: ["wages"],
      middleware: projectAuth,
      request: projectBody(CreateWagePaymentInput),
      responses: {
        201: {
          description: "Wage payment or advance recorded",
          content: json(WagePaymentResponse),
        },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await recordWagePayment(
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
      path: "/projects/{id}/wage-payments",
      tags: ["wages"],
      middleware: projectAuth,
      request: { params: IdParams, query: WagePaymentListQuery },
      responses: {
        200: {
          description: "Project wage payments with effective corrected amounts",
          content: json(WagePaymentListResponse),
        },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await listWagePayments(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
        200,
      ),
  );
