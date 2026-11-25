import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  CreateWorkerInput,
  DeactivateWorkerInput,
  WorkerParams,
  WorkerResponse,
  WorkersResponse,
} from "@/shared/schemas/workers";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { createWorker, deactivateWorker, listWorkers } from "../services/inventory";

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
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/workers/{workerId}/deactivate",
      tags: ["workers"],
      middleware: projectAuth,
      request: { ...projectBody(DeactivateWorkerInput), params: WorkerParams },
      responses: {
        200: { description: "Worker deactivated", content: json(WorkerResponse) },
        ...projectErrors,
        409: { description: "Worker already inactive", content: json(ErrorResponse) },
      },
    }),
    async (c) => {
      const { id, workerId } = c.req.valid("param");
      return c.json(
        await deactivateWorker(getDatabase().db, c.get("actor"), id, workerId, c.req.valid("json")),
        200,
      );
    },
  );
