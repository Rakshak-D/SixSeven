import { z } from "zod";
import { Id, IsoDate, Label, Paise, Role } from "./common";

export const AddProjectMemberInput = z.strictObject({
  email: z.email().max(254),
  role: z.enum(["owner", "engineer"]),
});
export const ProjectMemberResponse = z.strictObject({ userId: Id, role: Role });

export const CreateProjectInput = z.strictObject({
  name: Label,
  location: Label,
  startDate: IsoDate,
  budgetPaise: Paise,
});
export const ProjectResponse = z.strictObject({
  id: Id,
  name: Label,
  location: Label,
  startDate: IsoDate,
  budgetPaise: Paise,
  role: Role,
});
export const ProjectsResponse = z.array(ProjectResponse);

export type AddProjectMemberInput = z.infer<typeof AddProjectMemberInput>;
export type ProjectMemberResponse = z.infer<typeof ProjectMemberResponse>;
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
export type ProjectResponse = z.infer<typeof ProjectResponse>;
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;
