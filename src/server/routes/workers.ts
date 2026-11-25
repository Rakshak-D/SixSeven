import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { IdParams } from "@/shared/schemas/common";
import { CreateWorkerInput, WorkerResponse, WorkersResponse } from "@/shared/schemas/workers";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { createWorker, listWorkers } from "../services/inventory";

export const workers = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/workers",
      tags: ["workers"],
      middleware: projectAuth,
      request: projectBody(CreateWorkerInput),
      responses: {
        201: { description: "Worker registered", content: json(WorkerResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await createWorker(
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
      path: "/projects/{id}/workers",
      tags: ["workers"],
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Project workers", content: json(WorkersResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(await listWorkers(getDatabase().db, c.get("actor"), c.req.valid("param").id), 200),
  );
