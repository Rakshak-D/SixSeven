import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { IdParams } from "@/shared/schemas/common";
import { StockMovementsQuery, StockMovementsResponse, StockResponse } from "@/shared/schemas/stock";
import { json, projectAuth, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { listMovements, listStock } from "../services/stock-ledger";

export const stock = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/stock",
      tags: ["stock"],
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Material stock balances", content: json(StockResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(await listStock(getDatabase().db, c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/movements",
      tags: ["stock"],
      middleware: projectAuth,
      request: { params: IdParams, query: StockMovementsQuery },
      responses: {
        200: { description: "Material movements", content: json(StockMovementsResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await listMovements(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query").materialId,
        ),
        200,
      ),
  );
