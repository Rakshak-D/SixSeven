import { z } from "zod";

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
