import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import {
  ChecklistDraftQuery,
  ChecklistDraftRequest,
  ChecklistDraftResponse,
  CreateChecklistDraftInput,
  ReviewChecklistItemInput,
  SaveChecklistInput,
  SteelProofPhotos,
  VerifiedChecklistItemResponse,
  VerifiedChecklistResponse,
  VerifiedChecklistsResponse,
} from "@/shared/schemas/checklist";
import { Id, IdParams, Note } from "@/shared/schemas/common";
import { CaptureTimestampParts, PhotoFile } from "@/shared/schemas/progress";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import {
  accessItem,
  generateDraft,
  listChecklists,
  reviewItem,
  saveChecklist,
  startItem,
  submitItem,
} from "../services/checklists";
import { validateImageUpload } from "../services/photo-storage";
import { requireProjectAccess } from "../services/projects";
import { getSteelProofPhoto, listSteelProof, uploadSteelProof } from "../services/steel-proof";

const database = () => getDatabase().db;
const binaryFile = PhotoFile.openapi({ type: "string", format: "binary" });
const completionInput = z.strictObject({
  note: Note,
  photos: z.union([binaryFile, z.array(binaryFile).min(1).max(10)]),
  capturedAt: CaptureTimestampParts,
});
const steelCaptureTimestamp = z.iso.datetime({ offset: true });
const steelProofInput = z.strictObject({
  progressId: Id,
  note: Note,
  photos: z.union([binaryFile, z.array(binaryFile).min(1).max(3)]),
  capturedAt: z.union([steelCaptureTimestamp, z.array(steelCaptureTimestamp).min(1).max(3)]),
});
const binary = z.string().openapi({ format: "binary" });
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
const steelAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const params = IdParams.safeParse(c.req.param());
  if (!params.success) throw invalid("Invalid checklist item ID");
  await accessItem(database(), c.get("actor"), params.data.id, "engineer");
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
        await generateDraft(
          database(),
          c.get("actor"),
          c.req.valid("param").id,
          query.source,
          parsed.data.body,
        ),
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
      const { note, photos, capturedAt } = c.req.valid("form");
      return c.json(
        await submitItem(
          database(),
          c.get("actor"),
          c.req.valid("param").id,
          note,
          Array.isArray(photos) ? photos : [photos],
          [capturedAt].flat(),
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
      path: "/checklist-items/{id}/steel-proof",
      middleware: [requireActor, steelAccess, limit(15_100_000)],
      request: {
        params: IdParams,
        body: { required: true, content: { "multipart/form-data": { schema: steelProofInput } } },
      },
      responses: {
        201: { description: "Protected steel evidence recorded", content: json(SteelProofPhotos) },
        ...errors,
        ...oversized,
      },
    }),
    async (c) => {
      const { photos, capturedAt, ...fields } = c.req.valid("form");
      return c.json(
        await uploadSteelProof(database(), c.get("actor"), c.req.valid("param").id, {
          ...fields,
          photos: [photos].flat(),
          capturedAt: [capturedAt].flat(),
        }),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/checklist-items/{id}/steel-proof",
      middleware: projectAuth,
      request: { params: IdParams },
      responses: {
        200: { description: "Steel evidence metadata", content: json(SteelProofPhotos) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await listSteelProof(database(), c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/checklist-items/{id}/steel-proof/{photoId}",
      middleware: projectAuth,
      request: { params: z.strictObject({ id: Id, photoId: Id }) },
      responses: {
        200: {
          description: "Protected steel image",
          content: {
            "image/jpeg": { schema: binary },
            "image/png": { schema: binary },
            "image/webp": { schema: binary },
          },
        },
        ...errors,
      },
    }),
    async (c) => {
      const { id, photoId } = c.req.valid("param");
      const photo = await getSteelProofPhoto(database(), c.get("actor"), id, photoId);
      return c.body(Uint8Array.from(photo.bytes), 200, {
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
