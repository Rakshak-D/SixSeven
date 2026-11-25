import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { CreateDeliveryInput, DeliveryResponse } from "@/shared/schemas/deliveries";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { recordDelivery } from "../services/stock-ledger";

export const deliveries = createRouter<AuthEnv>().openapi(
  createRoute({
    method: "post",
    path: "/projects/{id}/deliveries",
    tags: ["deliveries"],
    middleware: projectAuth,
    request: projectBody(CreateDeliveryInput),
    responses: {
      201: { description: "Delivery recorded", content: json(DeliveryResponse) },
      ...projectErrors,
      409: {
        description: "Duplicate supplier challan or stock capacity exceeded",
        content: json(ErrorResponse),
      },
    },
  }),
  async (c) =>
    c.json(
      await recordDelivery(
        getDatabase().db,
        c.get("actor"),
        c.req.valid("param").id,
        c.req.valid("json"),
      ),
      201,
    ),
);
