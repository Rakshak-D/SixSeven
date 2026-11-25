import { generateObject } from "ai";
import {
  type ChecklistDraft,
  ChecklistDraft as ChecklistDraftSchema,
} from "@/shared/schemas/checklist";
import { getLanguageModel } from "./client";

export interface GenerateChecklistParams {
  houseType?: string;
  floors?: number;
  rooms?: number;
  notes?: string;
}

export interface GeneratedDraftResult {
  source: "ai" | "template";
  draft: ChecklistDraft;
  fallbackReason: "unavailable" | "error" | null;
}

/**
 * Generates a construction checklist plan using an AI model if configured,
 * or signals fallback to the static template if unconfigured or error occurs.
 */
export async function generateAiChecklist(
  params: GenerateChecklistParams,
): Promise<GeneratedDraftResult | null> {
  const model = getLanguageModel();
  if (!model) {
    return null;
  }

  const prompt = `You are a Senior Construction Engineer and Site Inspector.
Generate a structured, sequential checklist for a construction project with the following parameters:
- House/Building Type: ${params.houseType || "Residential House"}
- Floors: ${params.floors ?? 1}
- Rooms: ${params.rooms ?? 4}
${params.notes ? `- Additional Specifications: ${params.notes}` : ""}

Provide actionable inspection checklist items. Each item must specify:
1. phase: strictly one of "foundation", "plinth", "walls", "slab", "plumbing", "electrical", "plaster", "flooring", "finishing"
2. task: a concise inspection or task instruction (max 120 chars)
3. materials: an array of key materials required (e.g. ["Cement", "Steel", "Bricks"], max 5 items)

Group tasks chronologically and ensure critical engineering inspection milestones are present.`;

  try {
    const { object } = await generateObject({
      model,
      schema: ChecklistDraftSchema,
      prompt,
    });

    return {
      source: "ai",
      draft: object,
      fallbackReason: null,
    };
  } catch (error) {
    console.error("AI Checklist Generation Failed:", error);
    return {
      source: "template",
      draft: { items: [] },
      fallbackReason: "error",
    };
  }
}
