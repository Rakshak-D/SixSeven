import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import { IdParams, Note } from "@/shared/schemas/common";
import {
  CreateProgressInput,
  PhotoFile,
  PhotoParams,
  ProgressResponse,
  TimelineResponse,
} from "@/shared/schemas/progress";
import { json, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { createProgressUpdate, getProjectPhoto, getProjectTimeline } from "../services/progress";
import { requireProjectAccess } from "../services/projects";

const OpenApiPhotoFile = PhotoFile.openapi({ type: "string", format: "binary" });
const MultipartProgressInput = z.strictObject({
  note: Note,
  checklistItemId: IdParams.shape.id.optional(),
  photos: z.union([OpenApiPhotoFile, z.array(OpenApiPhotoFile).min(1).max(10)]),
});
const MAX_PROGRESS_REQUEST_BYTES = 51_000_000;
const uploadAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const params = IdParams.safeParse(c.req.param());
  if (!params.success) throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Invalid project ID");
  await requireProjectAccess(getDatabase().db, c.get("actor"), params.data.id, [
    "contractor",
    "engineer",
  ]);
  await next();
});
const uploadBodyLimit = bodyLimit({
  maxSize: MAX_PROGRESS_REQUEST_BYTES,
  onError: (c) =>
    c.json(
      {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Progress upload exceeds the 51 MB request limit",
        },
      },
      413,
    ),
});
const BinaryImage = z.string().openapi({ format: "binary" });

export const progress = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/progress",
      tags: ["progress"],
      middleware: [requireActor, uploadAccess, uploadBodyLimit],
      request: {
        params: IdParams,
        body: {
          required: true,
          content: { "multipart/form-data": { schema: MultipartProgressInput } },
        },
      },
      responses: {
        201: {
          description: "Progress update and validated photos recorded",
          content: json(ProgressResponse),
        },
        ...projectErrors,
        409: { description: "Upload cannot be completed", content: json(ErrorResponse) },
        413: {
          description: "Request exceeds the multipart size limit",
          content: json(ErrorResponse),
        },
      },
    }),
    async (c) => {
      const form = c.req.valid("form");
      const files = Array.isArray(form.photos) ? form.photos : [form.photos];
      const parsed = CreateProgressInput.safeParse({
        note: form.note,
        ...(form.checklistItemId && { checklistItemId: form.checklistItemId }),
        photos: files,
      });
      if (!parsed.success) {
        throw new ApiError(
          400,
          ErrorCode.VALIDATION_ERROR,
          "Invalid progress upload",
          parsed.error.issues,
        );
      }
      return c.json(
        await createProgressUpdate(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          parsed.data,
        ),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/timeline",
      tags: ["progress"],
      middleware: [requireActor],
      request: { params: IdParams },
      responses: {
        200: {
          description: "Project progress grouped by IST calendar day",
          content: json(TimelineResponse),
        },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await getProjectTimeline(getDatabase().db, c.get("actor"), c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/photos/{photoId}",
      tags: ["progress"],
      middleware: [requireActor],
      request: { params: PhotoParams },
      responses: {
        200: {
          description: "Protected image bytes",
          content: {
            "image/jpeg": { schema: BinaryImage },
            "image/png": { schema: BinaryImage },
            "image/webp": { schema: BinaryImage },
          },
        },
        ...projectErrors,
      },
    }),
    async (c) => {
      const { id, photoId } = c.req.valid("param");
      const photo = await getProjectPhoto(getDatabase().db, c.get("actor"), id, photoId);
      return c.body(Uint8Array.from(photo.bytes), 200, {
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename="${photo.id}.${photo.mime.split("/")[1] === "jpeg" ? "jpg" : photo.mime.split("/")[1]}"`,
      });
    },
  );
