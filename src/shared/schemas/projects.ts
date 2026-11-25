import { z } from "zod";
import { Id, IsoDate, Label, Paise, Role, Timestamp } from "./common";

const InvitationRole = z.enum(["owner", "contractor"]);
export const IndianMobileInput = z
  .string()
  .trim()
  .regex(/^(?:\+91)?[6-9][0-9]{9}$/);
export const IndianMobile = z.string().regex(/^\+91[6-9][0-9]{9}$/);
export const normalizeIndianMobile = (phone: string) =>
  IndianMobile.parse(phone.startsWith("+91") ? phone : `+91${phone}`);
export const CreateProjectInvitationInput = z.union([
  z.strictObject({ email: z.string().trim().pipe(z.email().max(254)), role: InvitationRole }),
  z.strictObject({ phone: IndianMobileInput, role: InvitationRole }),
]);
export const ProjectInvitationStatus = z.enum(["pending", "accepted"]);
export const ProjectInvitationQuery = z.strictObject({
  status: ProjectInvitationStatus.optional(),
});
const invitation = {
  id: Id,
  projectId: Id,
  projectName: Label,
  role: InvitationRole,
  createdAt: Timestamp,
  status: ProjectInvitationStatus,
};
export const ProjectInvitationResponse = z.union([
  z.strictObject({ ...invitation, email: z.email() }),
  z.strictObject({ ...invitation, phone: IndianMobile }),
]);
export const ProjectInvitationsResponse = z.array(ProjectInvitationResponse);
export type CreateProjectInvitationInput = z.infer<typeof CreateProjectInvitationInput>;
export type ProjectInvitationResponse = z.infer<typeof ProjectInvitationResponse>;
export type ProjectInvitationsResponse = z.infer<typeof ProjectInvitationsResponse>;
export type ProjectInvitationQuery = z.infer<typeof ProjectInvitationQuery>;

export const AddProjectMemberInput = z.strictObject({
  email: z.email().max(254),
  role: z.enum(["owner", "engineer"]),
});
export const ProjectMemberResponse = z.strictObject({ userId: Id, role: Role });
export const UpdateMyPhoneInput = z.strictObject({
  phone: IndianMobileInput.nullable(),
});
export const MyPhoneResponse = z.strictObject({ phone: IndianMobile.nullable() });
export const ProjectTeamResponse = z.array(
  ProjectMemberResponse.extend({
    name: Label,
    phone: IndianMobile.optional(),
  }),
);

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
export type UpdateMyPhoneInput = z.infer<typeof UpdateMyPhoneInput>;
export type MyPhoneResponse = z.infer<typeof MyPhoneResponse>;
export type ProjectTeamResponse = z.infer<typeof ProjectTeamResponse>;
export type CreateProjectInput = z.infer<typeof CreateProjectInput>;
export type ProjectResponse = z.infer<typeof ProjectResponse>;
export type ProjectsResponse = z.infer<typeof ProjectsResponse>;
