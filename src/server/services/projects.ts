import { and, asc, eq } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import type { Db, Transaction } from "@/db/client";
import { auditLog, projectMembers, projects } from "@/db/schema";
import type { Actor } from "@/server/middleware/auth";
import { ApiError } from "@/server/middleware/errors";
import { ErrorCode } from "@/shared/errors";
import type { Role } from "@/shared/schemas/common";
import type {
  AddProjectMemberInput,
  CreateProjectInput,
  ProjectMemberResponse,
  ProjectResponse,
} from "@/shared/schemas/projects";

const projectFields = {
  id: projects.id,
  name: projects.name,
  location: projects.location,
  startDate: projects.startDate,
  budgetPaise: projects.budgetPaise,
  role: projectMembers.role,
};

export async function requireProjectAccess(
  db: Db | Transaction,
  actor: Actor,
  projectId: string,
  roles?: readonly Role[],
) {
  const [project] = await db
    .select(projectFields)
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(and(eq(projects.id, projectId), eq(projectMembers.userId, actor.userId)));
  if (!project) throw new ApiError(404, ErrorCode.NOT_FOUND, "Project not found");
  if (roles && !roles.includes(project.role)) {
    throw new ApiError(403, ErrorCode.FORBIDDEN, "Your project role does not allow this operation");
  }
  return project;
}

export async function listProjects(db: Db, actor: Actor): Promise<ProjectResponse[]> {
  return db
    .select(projectFields)
    .from(projects)
    .innerJoin(projectMembers, eq(projects.id, projectMembers.projectId))
    .where(eq(projectMembers.userId, actor.userId))
    .orderBy(asc(projects.createdAt), asc(projects.id));
}

export async function createProject(
  db: Db,
  actor: Actor,
  input: CreateProjectInput,
): Promise<ProjectResponse> {
  const id = crypto.randomUUID();
  return db.transaction(async (tx) => {
    const project = { id, ...input };
    const role = "contractor";
    await tx.insert(projects).values({ ...project, createdBy: actor.userId });
    await tx.insert(projectMembers).values({ projectId: id, userId: actor.userId, role });
    await tx.insert(auditLog).values([
      {
        id: crypto.randomUUID(),
        projectId: id,
        actorId: actor.userId,
        action: "created",
        entity: "project",
        entityId: id,
      },
      {
        id: crypto.randomUUID(),
        projectId: id,
        actorId: actor.userId,
        action: "created",
        entity: "member",
        entityId: actor.userId,
        payload: { role },
      },
    ]);
    return { ...project, role };
  });
}

export async function addProjectMember(
  db: Db,
  actor: Actor,
  projectId: string,
  input: AddProjectMemberInput,
): Promise<ProjectMemberResponse> {
  return db.transaction(async (tx) => {
    await requireProjectAccess(tx, actor, projectId, ["contractor"]);
    const [account] = await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, input.email.toLowerCase()));
    if (!account) throw new ApiError(404, ErrorCode.NOT_FOUND, "Account not found");
    const [membership] = await tx
      .insert(projectMembers)
      .values({ projectId, userId: account.id, role: input.role })
      .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] })
      .returning({ userId: projectMembers.userId, role: projectMembers.role });
    if (!membership)
      throw new ApiError(409, ErrorCode.CONFLICT, "Account is already a project member");
    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      projectId,
      actorId: actor.userId,
      action: "created",
      entity: "member",
      entityId: account.id,
      payload: { role: input.role },
    });
    return membership;
  });
}
