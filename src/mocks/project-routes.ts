/**
 * Development fixtures for starting a project and inviting people (backend PR #30) and for the team
 * list. The demo user is invited to one project, so accepting can be tried. Another person cannot be
 * signed in on demo data, so invites you send stay waiting.
 */
import type { Role } from "@/shared/schemas/common";
import {
  CreateProjectInput,
  CreateProjectInvitationInput,
  normalizeIndianMobile,
  ProjectInvitationResponse,
  ProjectInvitationsResponse,
  ProjectMemberResponse,
  ProjectResponse,
  ProjectTeamResponse,
} from "@/shared/schemas/projects";
import { addDemoProject, allow, project } from "./routes";
import { MockError, type MockRoute, mockId, parseBody } from "./types";
import { demoPeople } from "./world";

const me = "you@example.com";
const phones: Record<Role, string> = {
  owner: "+919800000001",
  contractor: "+919800000002",
  engineer: "+919800000003",
};
const member = (role: Role) => ({
  userId: demoPeople[role].id,
  role,
  name: demoPeople[role].name,
  phone: phones[role],
});

/** Teams of projects started or joined in this session. Demo projects have all three people. */
const teams = new Map<string, ReturnType<typeof member>[]>();
const sent: ProjectInvitationResponse[] = [];
const received: ProjectInvitationResponse[] = [
  {
    id: "inv-riverside",
    projectId: "demo-riverside",
    projectName: "Riverside Cottage",
    email: me,
    status: "pending",
    role: "contractor",
    createdAt: "2026-11-25T09:00:00.000Z",
  },
];

export const projectRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/projects",
    respond: ({ body }) => {
      const input = parseBody(CreateProjectInput, body);
      const id = `new${Date.now().toString(36)}${teams.size}`;
      addDemoProject({ id, role: "engineer", ...input });
      teams.set(id, [member("engineer")]);
      return ProjectResponse.parse(project(id));
    },
  },
  {
    method: "GET",
    path: "/projects/:id/members",
    respond: ({ params }) => {
      allow(params.id, ["owner", "contractor", "engineer"]);
      return ProjectTeamResponse.parse(
        teams.get(params.id) ?? [member("owner"), member("contractor"), member("engineer")],
      );
    },
  },
  {
    method: "POST",
    path: "/projects/:id/invitations",
    respond: ({ params, body }) => {
      allow(params.id, ["engineer"]);
      const input = parseBody(CreateProjectInvitationInput, body);
      const contact =
        "email" in input
          ? { email: input.email.toLowerCase() }
          : { phone: normalizeIndianMobile(input.phone) };
      if (
        sent.some(
          (i) =>
            i.projectId === params.id &&
            ("email" in contact
              ? "email" in i && i.email === contact.email
              : "phone" in i && i.phone === contact.phone),
        )
      )
        throw new MockError(409, "CONFLICT", "That person already has an invite");
      const invite = ProjectInvitationResponse.parse({
        id: mockId(params.id, "inv"),
        projectId: params.id,
        projectName: project(params.id).name,
        ...contact,
        status: "pending",
        role: input.role,
        createdAt: new Date().toISOString(),
      });
      sent.push(invite);
      return invite;
    },
  },
  {
    method: "GET",
    path: "/projects/:id/invitations",
    respond: ({ params }) => {
      allow(params.id, ["engineer"]);
      return ProjectInvitationsResponse.parse(
        sent.filter((invite) => invite.projectId === params.id),
      );
    },
  },
  {
    method: "GET",
    path: "/invitations",
    respond: () => ProjectInvitationsResponse.parse(received),
  },
  {
    method: "POST",
    path: "/invitations/:id/accept",
    respond: ({ params }) => {
      const index = received.findIndex((i) => i.id === params.id);
      if (index < 0) throw new MockError(404, "NOT_FOUND", "Invitation not found");
      const [invite] = received.splice(index, 1);
      addDemoProject({
        id: invite.projectId,
        role: invite.role,
        name: invite.projectName,
        location: "Mangaluru",
        startDate: new Date().toISOString().slice(0, 10),
        budgetPaise: 450_000_000,
      });
      teams.set(invite.projectId, [member("engineer"), member(invite.role)]);
      return ProjectMemberResponse.parse({
        userId: demoPeople[invite.role].id,
        role: invite.role,
      });
    },
  },
];
