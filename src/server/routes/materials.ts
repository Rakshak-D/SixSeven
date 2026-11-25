import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { IdParams } from "@/shared/schemas/common";
import {
  CreateMaterialInput,
  MaterialResponse,
  MaterialsResponse,
} from "@/shared/schemas/materials";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { createMaterial, listMaterials } from "../services/inventory";

export const materials = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/materials",
      tags: ["materials"],
      middleware: projectAuth,
      request: projectBody(CreateMaterialInput),
      responses: {
        201: { description: "Material created", content: json(MaterialResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await createMaterial(
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
      path: "/projects/{id}/materials",
      tags: ["materials"],
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Project materials", content: json(MaterialsResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(await listMaterials(getDatabase().db, c.get("actor"), c.req.valid("param").id), 200),
  );
