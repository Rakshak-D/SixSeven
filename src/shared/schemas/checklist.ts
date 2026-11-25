import { z } from "zod";
import { Id, Label, Timestamp } from "./common";
import { PhotoFile } from "./progress";

export const ChecklistPhase = z.enum([
  "foundation",
  "plinth",
  "walls",
  "slab",
  "plumbing",
  "electrical",
  "plaster",
  "flooring",
  "finishing",
]);

/** What the AI (or the template fallback) drafts; the engineer edits before saving. */
export const ChecklistDraft = z.object({
  items: z
    .array(
      z.object({
        phase: ChecklistPhase,
        task: z.string().max(120),
        materials: z.array(z.string()).max(5),
      }),
    )
    .max(40),
});
export type ChecklistDraft = z.infer<typeof ChecklistDraft>;

export const ChecklistSource = z.enum(["template", "ai"]);
export const ChecklistDraftQuery = z.strictObject({ source: ChecklistSource });
export const CreateChecklistDraftInput = z.strictObject({
  houseType: Label.optional(),
  floors: z.int().min(1).max(100).optional(),
  rooms: z.int().min(1).max(500).optional(),
  plan: PhotoFile.optional(),
});
export const ChecklistDraftRequest = z
  .strictObject({ query: ChecklistDraftQuery, body: CreateChecklistDraftInput })
  .refine(
    ({ query, body }) =>
      query.source === "template" ||
      !!body.plan ||
      (body.houseType !== undefined && body.floors !== undefined && body.rooms !== undefined),
    { path: ["body"], message: "Provide a plan or house type, floors and rooms for AI" },
  );
export const ChecklistDraftResponse = z.strictObject({
  draftId: Id,
  source: ChecklistSource,
  fallbackReason: z.enum(["unavailable", "timeout", "invalidOutput"]).nullable(),
  draft: ChecklistDraft,
});
const ApprovedItem = z.strictObject({
  phase: ChecklistPhase,
  task: z.string().trim().min(1).max(120),
  materials: z.array(Label).max(5),
});
export const SaveChecklistInput = z.strictObject({
  draftId: Id,
  title: Label,
  items: z.array(ApprovedItem).min(1).max(40),
});
export const UpdateChecklistItemInput = z.strictObject({
  status: z.enum(["pending", "inProgress", "done"]),
});
export const ChecklistItemResponse = ApprovedItem.extend({
  id: Id,
  status: UpdateChecklistItemInput.shape.status,
});
export const ChecklistResponse = z.strictObject({
  id: Id,
  title: Label,
  source: ChecklistSource,
  createdAt: Timestamp,
  items: z.array(ChecklistItemResponse).min(1).max(40),
});
export const ChecklistsResponse = z.array(ChecklistResponse);

export type ChecklistDraftQuery = z.infer<typeof ChecklistDraftQuery>;
export type CreateChecklistDraftInput = z.infer<typeof CreateChecklistDraftInput>;
export type ChecklistDraftRequest = z.infer<typeof ChecklistDraftRequest>;
export type ChecklistDraftResponse = z.infer<typeof ChecklistDraftResponse>;
export type SaveChecklistInput = z.infer<typeof SaveChecklistInput>;
export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemInput>;
export type ChecklistItemResponse = z.infer<typeof ChecklistItemResponse>;
export type ChecklistResponse = z.infer<typeof ChecklistResponse>;
export type ChecklistsResponse = z.infer<typeof ChecklistsResponse>;
export const ChecklistVerificationStatus = z.enum(["todo", "doing", "waiting", "done", "sent_back"]);
export const ChecklistChangeReason = z.string().trim().min(10).max(2000);
export const ReviewChecklistItemInput = z.discriminatedUnion("decision", [
  z.strictObject({ decision: z.literal("accept"), note: z.string().trim().max(2000).optional() }),
  z.strictObject({ decision: z.literal("send_back"), note: ChecklistChangeReason }),
]);
export const RenameChecklistItemInput = z.strictObject({
  task: ApprovedItem.shape.task,
  reason: ChecklistChangeReason,
});
export const AddChecklistItemInput = ApprovedItem.extend({
  checklistId: Id,
  materials: ApprovedItem.shape.materials.default([]),
  reason: ChecklistChangeReason,
});
export const RemoveChecklistItemInput = z.strictObject({ reason: ChecklistChangeReason });
export const ChecklistEvent = z.strictObject({
  id: Id,
  kind: z.enum(["started", "submitted", "accepted", "sent_back", "added", "renamed", "removed"]),
  actorId: Id,
  createdAt: Timestamp,
  note: z.string().nullable(),
  previous: z.string().nullable(),
  next: z.string().nullable(),
  progressId: Id.nullable(),
});
export const VerifiedChecklistItemResponse = ChecklistItemResponse.extend({
  verificationStatus: ChecklistVerificationStatus,
  removedAt: Timestamp.nullable(),
  history: z.array(ChecklistEvent),
});
