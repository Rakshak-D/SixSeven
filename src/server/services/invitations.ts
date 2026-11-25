import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import type { Db, Transaction } from "@/db/client";
import { projectInvitations, projectMembers, projects } from "@/db/schema";
import { ErrorCode } from "@/shared/errors";
import {
  type CreateProjectInvitationInput,
  type ProjectInvitationQuery,
  ProjectInvitationResponse,
} from "@/shared/schemas/projects";
import type { Actor } from "../middleware/auth";
import { ApiError } from "../middleware/errors";
import { recordAudit } from "./audit";
import { requireProjectAccess } from "./projects";

const invitationFields = {
  id: projectInvitations.id,
  projectId: projectInvitations.projectId,
  email: projectInvitations.email,
  phone: projectInvitations.phone,
  role: projectInvitations.role,
  createdAt: projectInvitations.createdAt,
  acceptedAt: projectInvitations.acceptedAt,
};

function present({
  email,
  phone,
  acceptedAt,
  createdAt,
  ...row
}: {
  email: string | null;
  phone: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  id: string;
  projectId: string;
  projectName: string;
  role: string;
}) {
  return ProjectInvitationResponse.parse({
    ...row,
    ...(email ? { email } : { phone }),
    status: acceptedAt ? "accepted" : "pending",
    createdAt: createdAt.toISOString(),
  });
}

async function accountEmail(db: Db | Transaction, actor: Actor) {
  const [account] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, actor.userId));
  if (!account) throw new ApiError(401, ErrorCode.UNAUTHENTICATED, "Sign in to continue");
  return account.email.toLowerCase();
}

export async function createProjectInvitation(
  db: Db,
  actor: Actor,
  projectId: string,
  input: CreateProjectInvitationInput,
) {
  return db.transaction(async (tx) => {
    const project = await requireProjectAccess(tx, actor, projectId, ["engineer"]);
    const email = "email" in input ? input.email.toLowerCase() : null;
    const phone =
      "phone" in input ? (input.phone.startsWith("+91") ? input.phone : `+91${input.phone}`) : null;
    const [member] = email
      ? await tx
          .select({ id: user.id })
          .from(user)
          .innerJoin(projectMembers, eq(projectMembers.userId, user.id))
          .where(and(eq(projectMembers.projectId, projectId), sql`lower(${user.email}) = ${email}`))
      : [];
    if (member)
      throw new ApiError(409, ErrorCode.CONFLICT, "That account already belongs to this project");
    const [invitation] = await tx
      .insert(projectInvitations)
      .values({
        id: crypto.randomUUID(),
        projectId,
        email,
        phone,
        role: input.role,
        invitedBy: actor.userId,
      })
      .onConflictDoNothing()
      .returning(invitationFields);
    if (!invitation)
      throw new ApiError(409, ErrorCode.CONFLICT, "An invitation already exists for this address");
    await recordAudit(tx, {
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "invitation",
      entityId: invitation.id,
    });
    return present({ ...invitation, projectName: project.name });
  });
}

export async function listMyInvitations(db: Db, actor: Actor) {
  const email = await accountEmail(db, actor);
  const rows = await db
    .select({ ...invitationFields, projectName: projects.name })
    .from(projectInvitations)
    .innerJoin(projects, eq(projects.id, projectInvitations.projectId))
    .where(and(eq(projectInvitations.email, email), isNull(projectInvitations.acceptedAt)))
    .orderBy(desc(projectInvitations.createdAt), desc(projectInvitations.id));
  return rows.map(present);
}

export async function listProjectInvitations(
  db: Db,
  actor: Actor,
  projectId: string,
  query: ProjectInvitationQuery,
) {
  return db.transaction(
    async (tx) => {
      const project = await requireProjectAccess(tx, actor, projectId, ["engineer"]);
      const status =
        query.status === "pending"
          ? isNull(projectInvitations.acceptedAt)
          : query.status === "accepted"
            ? isNotNull(projectInvitations.acceptedAt)
            : undefined;
      const rows = await tx
        .select(invitationFields)
        .from(projectInvitations)
        .where(and(eq(projectInvitations.projectId, projectId), status))
        .orderBy(desc(projectInvitations.createdAt), desc(projectInvitations.id));
      return rows.map((row) => present({ ...row, projectName: project.name }));
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function acceptProjectInvitation(db: Db, actor: Actor, id: string) {
  return db.transaction(async (tx) => {
    const email = await accountEmail(tx, actor);
    const target = and(eq(projectInvitations.id, id), eq(projectInvitations.email, email));
    const [invitation] = await tx
      .update(projectInvitations)
      .set({ acceptedBy: actor.userId, acceptedAt: sql`now()` })
      .where(and(target, isNull(projectInvitations.acceptedAt)))
      .returning({ projectId: projectInvitations.projectId, role: projectInvitations.role });
    if (!invitation) {
      const [existing] = await tx
        .select({ id: projectInvitations.id })
        .from(projectInvitations)
        .where(target);
      if (!existing) throw new ApiError(404, ErrorCode.NOT_FOUND, "Invitation not found");
      throw new ApiError(409, ErrorCode.CONFLICT, "Invitation already accepted");
    }
    const [member] = await tx
      .insert(projectMembers)
      .values({ projectId: invitation.projectId, userId: actor.userId, role: invitation.role })
      .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] })
      .returning({ userId: projectMembers.userId, role: projectMembers.role });
    if (!member) throw new ApiError(409, ErrorCode.CONFLICT, "You already belong to this project");
    await recordAudit(tx, {
      projectId: invitation.projectId,
      actorId: actor.userId,
      action: "created",
      entity: "member",
      entityId: member.userId,
      payload: { role: member.role, invitationId: id },
    });
    return member;
  });
}
