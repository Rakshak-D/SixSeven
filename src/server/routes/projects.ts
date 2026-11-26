import { createRoute } from "@hono/zod-openapi";
import { getDatabase } from "@/db/client";
import { ErrorResponse } from "@/shared/errors";
import { IdParams } from "@/shared/schemas/common";
import {
  AddProjectMemberInput,
  CreateProjectInput,
  CreateProjectInvitationInput,
  InvitationClosedResponse,
  InvitationSignUpInput,
  InvitationSignUpResponse,
  MyPermissionsResponse,
  MyPhoneResponse,
  ProjectInvitationParams,
  ProjectInvitationQuery,
  ProjectInvitationResponse,
  ProjectInvitationsResponse,
  ProjectMemberParams,
  ProjectMemberRemovedResponse,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectsResponse,
  ProjectTeamResponse,
  UpdateMyPhoneInput,
} from "@/shared/schemas/projects";
import { createRouter } from "../lib/router";
import { type AuthEnv, requireActor } from "../middleware/auth";
import {
  acceptProjectInvitation,
  createProjectInvitation,
  declineProjectInvitation,
  listMyInvitations,
  listProjectInvitations,
  revokeProjectInvitation,
  signUpInvited,
} from "../services/invitations";
import {
  addProjectMember,
  canCreateProjects,
  createProject,
  listProjects,
  listProjectTeam,
  removeProjectMember,
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
      path: "/invitations/signup",
      tags: ["projects"],
      request: { body: { required: true, content: json(InvitationSignUpInput) } },
      responses: {
        201: {
          description: "Account created; sign in, then accept",
          content: json(InvitationSignUpResponse),
        },
        400: error("Invalid request"),
        409: error("No pending invitation for this email, or it already has an account"),
        500: error("Unexpected error"),
      },
    }),
    async (c) => c.json(await signUpInvited(getDatabase().db, c.req.valid("json")), 201),
  )
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
      method: "post",
      path: "/invitations/{id}/decline",
      tags: ["projects"],
      middleware: auth,
      request: { params: IdParams },
      responses: {
        200: {
          description: "Invitation declined and deleted",
          content: json(InvitationClosedResponse),
        },
        ...errors,
        409: error("Invitation already accepted"),
      },
    }),
    async (c) =>
      c.json(
        await declineProjectInvitation(getDatabase().db, c.get("actor"), c.req.valid("param").id),
        200,
      ),
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/projects/{id}/invitations/{invitationId}",
      tags: ["projects"],
      middleware: auth,
      request: { params: ProjectInvitationParams },
      responses: {
        200: {
          description: "Pending invitation revoked and deleted (engineers)",
          content: json(InvitationClosedResponse),
        },
        ...errors,
        409: error("Invitation already accepted; remove the member instead"),
      },
    }),
    async (c) => {
      const { id, invitationId } = c.req.valid("param");
      return c.json(
        await revokeProjectInvitation(getDatabase().db, c.get("actor"), id, invitationId),
        200,
      );
    },
  )
  .openapi(
    createRoute({
      method: "delete",
      path: "/projects/{id}/members/{userId}",
      tags: ["projects"],
      middleware: auth,
      request: { params: ProjectMemberParams },
      responses: {
        200: {
          description: "Member removed; their records stay (engineers)",
          content: json(ProjectMemberRemovedResponse),
        },
        ...errors,
        409: error("Engineers cannot remove themselves"),
      },
    }),
    async (c) => {
      const { id, userId } = c.req.valid("param");
      return c.json(await removeProjectMember(getDatabase().db, c.get("actor"), id, userId), 200);
    },
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
      method: "get",
      path: "/me/permissions",
      tags: ["projects"],
      middleware: auth,
      responses: {
        200: {
          description: "What the caller may do outside a project",
          content: json(MyPermissionsResponse),
        },
        ...errors,
      },
    }),
    async (c) =>
      c.json({ canCreateProjects: await canCreateProjects(getDatabase().db, c.get("actor")) }, 200),
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
