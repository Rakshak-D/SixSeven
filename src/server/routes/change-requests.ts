import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import {
  ChangeRequestResponse,
  ChangeRequestsQuery,
  ChangeRequestsResponse,
  CreateChangeRequestInput,
  DecideChangeRequestInput,
  ReopenChangeRequestInput,
  VoteChangeRequestInput,
} from "@/shared/schemas/change-requests";
import { IdParams } from "@/shared/schemas/common";
import { json, projectAuth, projectBody, projectErrors } from "../lib/project-route";
import { createRouter } from "../lib/router";
import type { AuthEnv } from "../middleware/auth";
import {
  createChangeRequest,
  decideChangeRequest,
  listChangeRequests,
  reopenChangeRequest,
  voteChangeRequest,
} from "../services/change-requests";

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
  );
