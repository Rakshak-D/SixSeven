import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import {
  AddChecklistItemInput,
  ChecklistDraftQuery,
  ChecklistDraftRequest,
  ChecklistDraftResponse,
  CreateChecklistDraftInput,
  RemoveChecklistItemInput,
  RenameChecklistItemInput,
  ReviewChecklistItemInput,
  SaveChecklistInput,
  VerifiedChecklistItemResponse,
  VerifiedChecklistResponse,
  VerifiedChecklistsResponse,
} from "@/shared/schemas/checklist";
import { IdParams, Note } from "@/shared/schemas/common";
import { PhotoFile } from "@/shared/schemas/progress";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import {
  accessItem,
  addItem,
  editItem,
  generateDraft,
  listChecklists,
  reviewItem,
  saveChecklist,
  startItem,
  submitItem,
} from "../services/checklists";
import { validateImageUpload } from "../services/photo-storage";
import { requireProjectAccess } from "../services/projects";

const database = () => getDatabase().db;
const binaryFile = PhotoFile.openapi({ type: "string", format: "binary" });
const completionInput = z.strictObject({
  note: Note,
  photos: z.union([binaryFile, z.array(binaryFile).min(1).max(10)]),
});
const draftForm = CreateChecklistDraftInput.extend({
  plan: binaryFile.optional(),
  floors: z.coerce.number().int().min(1).max(100).optional(),
  rooms: z.coerce.number().int().min(1).max(500).optional(),
});
const invalid = (message: string) => new ApiError(400, ErrorCode.VALIDATION_ERROR, message);
const limit = (maxSize: number) =>
  bodyLimit({
    maxSize,
    onError: (c) =>
      c.json(
        {
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: "Checklist request exceeds the size limit",
          },
        },
        413,
      ),
  });
const draftAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const params = IdParams.safeParse(c.req.param());
  if (!params.success) throw invalid("Invalid project ID");
  await requireProjectAccess(database(), c.get("actor"), params.data.id, ["engineer"]);
  await next();
});
const completionAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const params = IdParams.safeParse(c.req.param());
  if (!params.success) throw invalid("Invalid checklist item ID");
  await accessItem(database(), c.get("actor"), params.data.id, "contractor");
  await next();
});
const errors = {
  ...projectErrors,
  409: {
    description: "Invalid workflow state or duplicate submission",
    content: json(ErrorResponse),
  },
};
const oversized = { 413: { description: "Request is too large", content: json(ErrorResponse) } };
const item = {
  description: "Checklist item and history",
  content: json(VerifiedChecklistItemResponse),
};

export const checklists = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/checklists",
      middleware: [requireActor, draftAccess, limit(5_100_000)],
      request: {
        params: IdParams,
        query: ChecklistDraftQuery,
        body: {
          required: true,
          content: {
            "application/json": { schema: CreateChecklistDraftInput.omit({ plan: true }) },
            "multipart/form-data": { schema: draftForm },
          },
        },
      },
      responses: {
        200: { description: "Editable template draft", content: json(ChecklistDraftResponse) },
        ...errors,
        ...oversized,
      },
    }),
    async (c) => {
      const query = c.req.valid("query");
      const body = c.req.header("Content-Type")?.startsWith("multipart/form-data")
        ? c.req.valid("form")
        : c.req.valid("json");
      const parsed = ChecklistDraftRequest.safeParse({ query, body });
      if (!parsed.success) throw invalid("Invalid checklist draft request");
      if (parsed.data.body.plan) await validateImageUpload(parsed.data.body.plan);
      return c.json(
        await generateDraft(database(), c.get("actor"), c.req.valid("param").id, query.source),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/checklists/records",
      middleware: projectAuth,
      request: projectBody(SaveChecklistInput),
      responses: {
        201: { description: "Reviewed checklist", content: json(VerifiedChecklistResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await saveChecklist(
          database(),
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
      path: "/projects/{id}/checklists",
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Project checklists", content: json(VerifiedChecklistsResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await listChecklists(database(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checklist-items/{id}/start",
      middleware: projectAuth,
      request: { params: IdParams },
      responses: { 200: item, ...errors },
    }),
    async (c) => c.json(await startItem(database(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checklist-items/{id}/completion",
      middleware: [requireActor, completionAccess, limit(51_000_000)],
      request: {
        params: IdParams,
        body: { required: true, content: { "multipart/form-data": { schema: completionInput } } },
      },
      responses: { 200: item, ...errors, ...oversized },
    }),
    async (c) => {
      const { note, photos } = c.req.valid("form");
      return c.json(
        await submitItem(
          database(),
          c.get("actor"),
          c.req.valid("param").id,
          note,
          Array.isArray(photos) ? photos : [photos],
        ),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/checklist-items/{id}/review",
      middleware: projectAuth,
      request: projectBody(ReviewChecklistItemInput),
      responses: { 200: item, ...errors },
    }),
    async (c) =>
      c.json(
        await reviewItem(database(), c.get("actor"), c.req.valid("param").id, c.req.valid("json")),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/checklist-items",
      middleware: projectAuth,
      request: projectBody(AddChecklistItemInput),
      responses: { 201: item, ...errors },
    }),
    async (c) =>
      c.json(
        await addItem(database(), c.get("actor"), c.req.valid("param").id, c.req.valid("json")),
        201,
      ),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/checklist-items/{id}",
      middleware: projectAuth,
      request: projectBody(RenameChecklistItemInput),
      responses: { 200: item, ...errors },
    }),
    async (c) => {
      const { reason, task } = c.req.valid("json");
      return c.json(
        await editItem(database(), c.get("actor"), c.req.valid("param").id, reason, task),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/checklist-items/{id}",
      middleware: projectAuth,
      request: projectBody(RemoveChecklistItemInput),
      responses: { 200: item, ...errors },
    }),
    async (c) =>
      c.json(
        await editItem(
          database(),
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json").reason,
        ),
        200,
      ),
  );
