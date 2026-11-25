/**
 * TEMPORARY copy of the invitation shapes in backend PR #30 (`be/project-invitations`), which is not
 * merged yet. Same names and fields. When it merges, delete this file and import these from
 * "@/shared/schemas/projects".
 */
import { z } from "zod";
import { Id, Label, Timestamp } from "@/shared/schemas/common";

const InvitationRole = z.enum(["owner", "contractor"]);
export const CreateProjectInvitationInput = z.strictObject({
  email: z.string().trim().pipe(z.email().max(254)),
  role: InvitationRole,
});
export const ProjectInvitationResponse = z.strictObject({
  id: Id,
  projectId: Id,
  projectName: Label,
  email: z.email(),
  role: InvitationRole,
  createdAt: Timestamp,
});
export const ProjectInvitationsResponse = z.array(ProjectInvitationResponse);
export type CreateProjectInvitationInput = z.infer<typeof CreateProjectInvitationInput>;
export type ProjectInvitationResponse = z.infer<typeof ProjectInvitationResponse>;
