import { createRoute } from "@hono/zod-openapi";
import { bodyLimit } from "hono/body-limit";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { ErrorCode, ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  ChallanPhotoParams,
  ChallanPhotoResponse,
  CreateChallanPhotoInput,
  CreateDeliveryInput,
  CreateExpectedDeliveryInput,
  DeliveryResponse,
  ExpectedDeliveriesQuery,
  ExpectedDeliveriesResponse,
  ExpectedDeliveryResponse,
  RejectExpectedDeliveryInput,
} from "@/shared/schemas/deliveries";
import { MaxPhotoBytes } from "@/shared/schemas/progress";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { attachChallanPhoto, getChallanPhoto } from "../services/challan-photos";
import {
  acceptExpectedDelivery,
  listExpectedDeliveries,
  rejectExpectedDelivery,
  scheduleDelivery,
} from "../services/expected-deliveries";
import { requireProjectAccess } from "../services/projects";

const conflict = {
  description: "State, attachment or stock conflict",
  content: json(ErrorResponse),
};
const photoLimit = bodyLimit({
  maxSize: MaxPhotoBytes + 50_000,
  onError: (c) =>
    c.json(
      {
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Challan upload exceeds the request size limit",
        },
      },
      413,
    ),
});
const checkUploadAccess = createMiddleware<AuthEnv>(async (c, next) => {
  const { success, data } = ChallanPhotoParams.safeParse(c.req.param());
  if (!success)
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "Invalid delivery or project ID");
  await requireProjectAccess(getDatabase().db, c.get("actor"), data.id, ["contractor"]);
  await next();
});
const uploadForm = CreateChallanPhotoInput.extend({
  photo: CreateChallanPhotoInput.shape.photo.openapi({ type: "string", format: "binary" }),
});
const binary = z.string().openapi({ format: "binary" });

export const deliveryLogistics = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/expected-deliveries",
      tags: ["deliveries"],
      middleware: projectAuth,
      request: projectBody(CreateExpectedDeliveryInput),
      responses: {
        201: { description: "Delivery scheduled", content: json(ExpectedDeliveryResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await scheduleDelivery(
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
      path: "/projects/{id}/expected-deliveries",
      tags: ["deliveries"],
      middleware: projectAuth,
      request: { params: IdParams, query: ExpectedDeliveriesQuery },
      responses: {
        200: { description: "Expected deliveries", content: json(ExpectedDeliveriesResponse) },
        ...projectErrors,
      },
    }),
    async (c) =>
      c.json(
        await listExpectedDeliveries(
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
      path: "/expected-deliveries/{id}/accept",
      tags: ["deliveries"],
      middleware: projectAuth,
      request: projectBody(CreateDeliveryInput),
      responses: {
        201: { description: "Actual delivery recorded", content: json(DeliveryResponse) },
        ...projectErrors,
        409: conflict,
      },
    }),
    async (c) =>
      c.json(
        await acceptExpectedDelivery(
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
      method: "post",
      path: "/expected-deliveries/{id}/reject",
      tags: ["deliveries"],
      middleware: projectAuth,
      request: projectBody(RejectExpectedDeliveryInput),
      responses: {
        200: { description: "Delivery rejected", content: json(ExpectedDeliveryResponse) },
        ...projectErrors,
        409: conflict,
      },
    }),
    async (c) =>
      c.json(
        await rejectExpectedDelivery(
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
      path: "/projects/{id}/deliveries/{deliveryId}/challan-photo",
      tags: ["deliveries"],
      middleware: [...projectAuth, checkUploadAccess, photoLimit],
      request: {
        params: ChallanPhotoParams,
        body: { required: true, content: { "multipart/form-data": { schema: uploadForm } } },
      },
      responses: {
        201: { description: "Private challan photo stored", content: json(ChallanPhotoResponse) },
        ...projectErrors,
        409: conflict,
        413: { description: "Upload too large", content: json(ErrorResponse) },
      },
    }),
    async (c) => {
      const { id, deliveryId } = c.req.valid("param");
      return c.json(
        await attachChallanPhoto(
          getDatabase().db,
          c.get("actor"),
          id,
          deliveryId,
          c.req.valid("form").photo,
          c.req.valid("form").capturedAt,
        ),
        201,
      );
    },
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}/deliveries/{deliveryId}/challan-photo",
      tags: ["deliveries"],
      middleware: projectAuth,
      request: { params: ChallanPhotoParams },
      responses: {
        200: {
          description: "Private challan photo bytes",
          content: {
            "image/jpeg": { schema: binary },
            "image/png": { schema: binary },
            "image/webp": { schema: binary },
          },
        },
        ...projectErrors,
      },
    }),
    async (c) => {
      const { id, deliveryId } = c.req.valid("param");
      const { bytes, mime } = await getChallanPhoto(
        getDatabase().db,
        c.get("actor"),
        id,
        deliveryId,
      );
      return c.body(Uint8Array.from(bytes), 200, {
        "Content-Type": mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
    },
  );
