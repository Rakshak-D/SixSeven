import { streamText } from "ai";
import { getLanguageModel } from "./client";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface StreamChatParams {
  messages: ChatMessage[];
  projectContext?: {
    name?: string;
    location?: string;
    role?: string;
    budgetPaise?: number;
  };
}

/**
 * Creates a text stream for the AI Construction Assistant.
 */
export async function streamAssistantChat(params: StreamChatParams) {
  const model = getLanguageModel();
  if (!model) {
    return null;
  }

  const systemPrompt = `You are "Slate AI Copilot", an expert construction engineer, site surveyor, and project estimator.
You assist contractors, site engineers, and owners with:
1. Material quantity estimates (concrete dry mix factors, steel reinforcement kg/m3, brickwork, sand, mortar).
2. Construction planning, sequence of works, and phase-by-phase inspection checklists (Foundation -> Plinth -> Slab -> Finishing).
3. Labour scheduling and wage calculations.
4. Problem troubleshooting on site (concrete curing, cracks, honeycombing, damp-proof courses).

Current Project Context:
- Project: ${params.projectContext?.name || "Site"}
- Location: ${params.projectContext?.location || "India"}
- User Role: ${params.projectContext?.role || "Team Member"}

Guidelines:
- Give concise, direct, practical, and mathematically accurate engineering answers.
- State standard assumptions (e.g. concrete dry factor = 1.54, standard 50kg cement bag = 0.035 m³).
- Keep answers formatted in markdown with bullet points or small tables where applicable.`;

  return streamText({
    model,
    system: systemPrompt,
    messages: params.messages,
  });
}
