import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import {
  ChangeRequestResponse,
  ChangeRequestsQuery,
  ChangeRequestsResponse,
  CreateChangeRequestInput,
  DecideChangeRequestInput,
  MedicalExpenseFields,
  ReopenChangeRequestInput,
  VoteChangeRequestInput,
} from "@/shared/schemas/change-requests";
import { Id, IdParams } from "@/shared/schemas/common";
import { PhotoFile } from "@/shared/schemas/progress";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import {
  createChangeRequest,
  createMedicalExpense,
  decideChangeRequest,
  listChangeRequests,
  reopenChangeRequest,
  voteChangeRequest,
} from "../services/change-requests";
import { getMedicalBillPhoto } from "../services/medical-claims";
import { requireProjectAccess } from "../services/projects";

const billPhoto = PhotoFile.openapi({ type: "string", format: "binary" });
const captureTime = z.iso.datetime({ offset: true });
const billForm = MedicalExpenseFields.extend({
  billPaise: z.string().regex(/^[0-9]+$/),
  billPhotos: z.union([billPhoto, z.array(billPhoto).min(1).max(3)]),
  capturedAt: z.union([captureTime, z.array(captureTime).min(1).max(3)]),
});
const billParams = z.strictObject({ id: Id, requestId: Id, photoId: Id });
const binary = z.string().openapi({ format: "binary" });
const billAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const parsed = IdParams.safeParse(c.req.param());
  if (!parsed.success) throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Invalid project ID");
  await requireProjectAccess(getDatabase().db, c.get("actor"), parsed.data.id, [
    "engineer",
    "contractor",
  ]);
  await next();
});
const billLimit = bodyLimit({
  maxSize: 15_100_000,
  onError: (c) =>
    c.json(
      {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Medical bill upload exceeds the request size limit",
        },
      },
      413,
    ),
});

const response = {
  description: "Change request and decision history",
  content: json(ChangeRequestResponse),
};
const errors = {
  ...projectErrors,
  409: {
    description: "The request state or target no longer permits this operation",
    content: json(ErrorResponse),
  },
};

export const changeRequests = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/change-requests",
      tags: ["change requests"],
      middleware: projectAuth,
      request: projectBody(CreateChangeRequestInput),
      responses: { 201: response, ...errors },
    }),
    async (c) =>
      c.json(
        await createChangeRequest(
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
      path: "/projects/{id}/change-requests",
      tags: ["change requests"],
      middleware: projectAuth,
      request: { params: IdParams, query: ChangeRequestsQuery },
      responses: {
        200: { description: "Visible requests", content: json(ChangeRequestsResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listChangeRequests(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("query"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/change-requests/{id}/vote",
      tags: ["change requests"],
      middleware: projectAuth,
      request: projectBody(VoteChangeRequestInput),
      responses: { 200: response, ...errors },
    }),
    async (c) =>
      c.json(
        await voteChangeRequest(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/change-requests/{id}/reopen",
      tags: ["change requests"],
      middleware: projectAuth,
      request: projectBody(ReopenChangeRequestInput),
      responses: { 200: response, ...errors },
    }),
    async (c) =>
      c.json(
        await reopenChangeRequest(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/change-requests/{id}/decision",
      tags: ["change requests"],
      middleware: projectAuth,
      request: projectBody(DecideChangeRequestInput),
      responses: { 200: response, ...errors },
    }),
    async (c) =>
      c.json(
        await decideChangeRequest(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          c.req.valid("json"),
        ),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/medical-expenses",
      tags: ["change requests"],
      middleware: [...projectAuth, billAccess, billLimit],
      request: {
        params: IdParams,
        body: { required: true, content: { "multipart/form-data": { schema: billForm } } },
      },
      responses: {
        201: response,
        ...errors,
        413: { description: "Upload too large", content: json(ErrorResponse) },
      },
    }),
    async (c) => {
      const { billPhotos, capturedAt, ...fields } = c.req.valid("form");
      const parsed = MedicalExpenseFields.safeParse({
        ...fields,
        billPaise: Number(fields.billPaise),
      });
      if (!parsed.success)
        throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Invalid bill amount");
      return c.json(
        await createMedicalExpense(
          getDatabase().db,
          c.get("actor"),
          c.req.valid("param").id,
          parsed.data,
          [billPhotos].flat(),
          [capturedAt].flat(),
          new Date(),
        ),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/medical-expenses/{requestId}/photos/{photoId}",
      tags: ["change requests"],
      middleware: projectAuth,
      request: { params: billParams },
      responses: {
        200: {
          description: "Protected bill image",
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
      const { id, requestId, photoId } = c.req.valid("param");
      const photo = await getMedicalBillPhoto(
        getDatabase().db,
        c.get("actor"),
        id,
        requestId,
        photoId,
      );
      return c.body(Uint8Array.from(photo.bytes), 200, {
        "Content-Type": photo.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
