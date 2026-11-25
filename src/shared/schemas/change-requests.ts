import { z } from "zod";
import { AddChecklistItemInput, RenameChecklistItemInput } from "./checklist";
import { HalfDays, Id, IsoDate, Note, PositivePaise, Timestamp } from "./common";
import { PhotoResponse } from "./progress";

export const ChangeRequestKind = z.enum([
  "checklist_add",
  "checklist_rename",
  "checklist_remove",
  "attendance_fix",
  "medical_expense",
]);
export const ChangeRequestStatus = z.enum([
  "pending_contractor",
  "pending_owner",
  "rejected_contractor",
  "accepted",
  "rejected_owner",
]);
const AuthorRole = z.enum(["engineer", "contractor"]);
export const ChangeRequestEvent = z.strictObject({
  kind: z.enum([
    "created",
    "contractor_approved",
    "contractor_rejected",
    "reopened",
    "owner_accepted",
    "owner_rejected",
  ]),
  byUserId: Id,
  role: z.enum(["engineer", "contractor", "owner"]),
  note: Note,
  at: Timestamp,
});
export const AttendanceFixPayload = z
  .strictObject({
    newValue: HalfDays,
    reasonKind: z.enum(["medical_emergency", "other"]),
    payFullDay: z.boolean(),
  })
  .refine(({ reasonKind, payFullDay }) => !payFullDay || reasonKind === "medical_emergency", {
    path: ["payFullDay"],
    message: "Full-day pay requires a medical emergency",
  });
export const MedicalExpenseFields = z.strictObject({
  workerId: Id,
  billPaise: PositivePaise,
  incidentOn: IsoDate,
  note: Note,
});
const MedicalExpensePayload = MedicalExpenseFields.omit({ note: true }).extend({
  billPhotos: z.array(PhotoResponse).min(1).max(3),
});
const ChecklistAdd = z.strictObject({
  kind: z.literal("checklist_add"),
  payload: AddChecklistItemInput.omit({ reason: true }),
});
const ChecklistRename = z.strictObject({
  kind: z.literal("checklist_rename"),
  targetId: Id,
  payload: RenameChecklistItemInput.omit({ reason: true }),
});
const ChecklistRemove = z.strictObject({
  kind: z.literal("checklist_remove"),
  targetId: Id,
  payload: z.strictObject({}),
});
const AttendanceFix = z.strictObject({
  kind: z.literal("attendance_fix"),
  targetId: Id,
  payload: AttendanceFixPayload,
});
export const CreateChangeRequestInput = z.discriminatedUnion("kind", [
  ChecklistAdd.extend({ note: Note }),
  ChecklistRename.extend({ note: Note }),
  ChecklistRemove.extend({ note: Note }),
  AttendanceFix.extend({ note: Note }),
]);
const record = {
  id: Id,
  projectId: Id,
  authorId: Id,
  authorRole: AuthorRole,
  status: ChangeRequestStatus,
  events: z.array(ChangeRequestEvent).min(1),
};
export const ChangeRequest = z.discriminatedUnion("kind", [
  ChecklistAdd.extend(record),
  ChecklistRename.extend(record),
  ChecklistRemove.extend(record),
  AttendanceFix.extend(record),
  z.strictObject({
    ...record,
    kind: z.literal("medical_expense"),
    payload: MedicalExpensePayload,
    payPaise: PositivePaise.nullable(),
  }),
]);
export const ChangeRequestResponse = ChangeRequest;
export const ChangeRequestsResponse = z.array(ChangeRequest);
export const ChangeRequestsQuery = z.strictObject({ status: ChangeRequestStatus.optional() });
export const VoteChangeRequestInput = z.strictObject({ approve: z.boolean(), note: Note });
export const ReopenChangeRequestInput = z.strictObject({ note: Note });
export const DecideChangeRequestInput = z.discriminatedUnion("accept", [
  z.strictObject({ accept: z.literal(true), note: Note, payPaise: PositivePaise.optional() }),
  z.strictObject({ accept: z.literal(false), note: Note }),
]);

export type ChangeRequestKind = z.infer<typeof ChangeRequestKind>;
export type ChangeRequestStatus = z.infer<typeof ChangeRequestStatus>;
export type ChangeRequestEvent = z.infer<typeof ChangeRequestEvent>;
export type ChangeRequest = z.infer<typeof ChangeRequest>;
export type ChangeRequestResponse = ChangeRequest;
export type ChangeRequestsResponse = z.infer<typeof ChangeRequestsResponse>;
export type ChangeRequestsQuery = z.infer<typeof ChangeRequestsQuery>;
export type CreateChangeRequestInput = z.infer<typeof CreateChangeRequestInput>;
export type AttendanceFixPayload = z.infer<typeof AttendanceFixPayload>;
export type MedicalExpenseFields = z.infer<typeof MedicalExpenseFields>;
export type VoteChangeRequestInput = z.infer<typeof VoteChangeRequestInput>;
export type ReopenChangeRequestInput = z.infer<typeof ReopenChangeRequestInput>;
export type DecideChangeRequestInput = z.infer<typeof DecideChangeRequestInput>;
