import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  AddProjectMemberInput,
  CreateProjectInput,
  MyPhoneResponse,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectTeamResponse,
  UpdateMyPhoneInput,
} from "@/shared/schemas/projects";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import {
  addProjectMember,
  createProject,
  listProjects,
  listProjectTeam,
  requireProjectAccess,
  updateMyPhone,
} from "../services/projects";

const json = <T>(schema: T) => ({ "application/json": { schema } });
const auth: [typeof requireActor] = [requireActor];
const error = (description: string) => ({ description, content: json(ErrorResponse) });
const errors = {
  400: error("Invalid request"),
  401: error("Sign in required"),
  403: error("Forbidden"),
  404: error("Not found"),
  500: error("Unexpected error"),
};

export const projects = createRouter<AuthEnv>()
  .openapi(
    createRoute({
      method: "post",
      path: "/projects",
      tags: ["projects"],
      middleware: auth,
      request: { body: { required: true, content: json(CreateProjectInput) } },
      responses: {
        201: { description: "Project created", content: json(ProjectResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await createProject(getDatabase().db, c.get("actor"), c.req.valid("json")), 201),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects",
      tags: ["projects"],
      middleware: auth,
      responses: {
        200: { description: "Projects visible to the caller", content: json(ProjectsResponse) },
        ...errors,
      },
    }),
    async (c) => c.json(await listProjects(getDatabase().db, c.get("actor")), 200),
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/projects/{id}",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams },
      responses: {
        200: { description: "Visible project and caller role", content: json(ProjectResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await requireProjectAccess(getDatabase().db, c.get("actor"), c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/projects/{id}/members",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams, body: { required: true, content: json(AddProjectMemberInput) } },
      responses: {
        201: { description: "Account added to the project", content: json(ProjectMemberResponse) },
        ...errors,
        409: error("Account already belongs to the project"),
      },
    }),
    async (c) =>
      c.json(
        await addProjectMember(
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
      path: "/projects/{id}/members",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams },
      responses: {
        200: {
          description: "Project team and shared contact information",
          content: json(ProjectTeamResponse),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await listProjectTeam(getDatabase().db, c.get("actor"), c.req.valid("param").id), 200),
  )
  .openapi(
    createRoute({
      method: "patch",
      path: "/me",
      tags: ["projects"],
      middleware: auth,
      request: { body: { required: true, content: json(UpdateMyPhoneInput) } },
      responses: {
        200: { description: "Updated caller contact information", content: json(MyPhoneResponse) },
        ...errors,
      },
    }),
    async (c) =>
      c.json(await updateMyPhone(getDatabase().db, c.get("actor"), c.req.valid("json")), 200),
  );
