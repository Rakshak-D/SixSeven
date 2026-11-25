import type { z } from "zod";
import type {
  ReviewChecklistItemInput,
  VerifiedChecklistItemResponse,
  VerifiedChecklistResponse,
  VerifiedChecklistsResponse,
} from "@/shared/schemas/checklist";

// The shared contract exports the verified schemas but not their types; derive them here.
export type VerifiedChecklist = z.infer<typeof VerifiedChecklistResponse>;
export type VerifiedChecklists = z.infer<typeof VerifiedChecklistsResponse>;
export type VerifiedItem = z.infer<typeof VerifiedChecklistItemResponse>;
export type ReviewInput = z.infer<typeof ReviewChecklistItemInput>;

/** Items still on the plan: removals are soft, so the API keeps them with a removedAt. */
export function activeItems(checklists: VerifiedChecklists | undefined): VerifiedItem[] {
  return (checklists ?? []).flatMap((c) => c.items).filter((i) => !i.removedAt);
}

/** The proof the contractor last submitted for an item, which a review must name. */
export function latestSubmission(item: VerifiedItem) {
  return [...item.history].reverse().find((e) => e.kind === "submitted");
}
