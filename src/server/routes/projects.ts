import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  AddProjectMemberInput,
  CreateProjectInput,
  CreateProjectInvitationInput,
  MyPhoneResponse,
  PhoneVerificationStatus,
  ProjectInvitationQuery,
  ProjectInvitationResponse,
  ProjectInvitationsResponse,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectTeamResponse,
  UpdateMyPhoneInput,
  VerifyPhoneCodeInput,
} from "@/shared/schemas/projects";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  listMyInvitations,
  listProjectInvitations,
} from "../services/invitations";
import {
  checkPhoneVerification,
  phoneVerificationStatus,
  startPhoneVerification,
} from "../services/phone-verification";
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
      method: "post",
      path: "/projects/{id}/invitations",
      tags: ["projects"],
      middleware: auth,
      request: {
        params: IdParams,
        body: { required: true, content: json(CreateProjectInvitationInput) },
      },
      responses: {
        201: { description: "Invitation created", content: json(ProjectInvitationResponse) },
        ...errors,
        409: error("Account is already a member or invitee"),
      },
    }),
    async (c) =>
      c.json(
        await createProjectInvitation(
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
      path: "/projects/{id}/invitations",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams, query: ProjectInvitationQuery },
      responses: {
        200: {
          description: "Project invitation status for engineers",
          content: json(ProjectInvitationsResponse),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json(
        await listProjectInvitations(
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
      method: "get",
      path: "/invitations",
      tags: ["projects"],
      middleware: auth,
      responses: {
        200: {
          description: "Caller’s pending invitations",
          content: json(ProjectInvitationsResponse),
        },
        ...errors,
      },
    }),
    async (c) => c.json(await listMyInvitations(getDatabase().db, c.get("actor")), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/invitations/{id}/accept",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams },
      responses: {
        200: { description: "Invitation accepted", content: json(ProjectMemberResponse) },
        ...errors,
        409: error("Invitation already accepted or account already a member"),
      },
    }),
    async (c) =>
      c.json(
        await acceptProjectInvitation(getDatabase().db, c.get("actor"), c.req.valid("param").id),
        200,
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
  )
  .openapi(
    createRoute({
      method: "get",
      path: "/me/phone-verification",
      middleware: auth,
      tags: ["projects"],
      responses: {
        200: { description: "Phone verification status", content: json(PhoneVerificationStatus) },
        ...errors,
        409: error("Phone conflict"),
        429: error("Retry later"),
        503: error("SMS verification unavailable"),
      },
    }),
    async (c) =>
      c.json(await phoneVerificationStatus(getDatabase().db, c.get("actor").userId), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/me/phone-verification/start",
      middleware: auth,
      tags: ["projects"],
      responses: {
        200: { description: "Phone verification status", content: json(PhoneVerificationStatus) },
        ...errors,
        409: error("Phone conflict"),
        429: error("Retry later"),
        503: error("SMS verification unavailable"),
      },
    }),
    async (c) => c.json(await startPhoneVerification(getDatabase().db, c.get("actor").userId), 200),
  )
  .openapi(
    createRoute({
      method: "post",
      path: "/me/phone-verification/check",
      middleware: auth,
      tags: ["projects"],
      request: { body: { required: true, content: json(VerifyPhoneCodeInput) } },
      responses: {
        200: { description: "Phone verification status", content: json(PhoneVerificationStatus) },
        ...errors,
        409: error("Phone conflict"),
        429: error("Retry later"),
        503: error("SMS verification unavailable"),
      },
    }),
    async (c) =>
      c.json(
        await checkPhoneVerification(
          getDatabase().db,
          c.get("actor").userId,
          c.req.valid("json").code,
        ),
        200,
      ),
  );
