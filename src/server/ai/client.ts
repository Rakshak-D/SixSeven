import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export type AiProvider = "google" | "gemini" | "groq" | "openai-compatible" | "nvidia";

export interface AiClientConfig {
  provider?: string;
  model?: string;
  apiKey?: string;
  baseURL?: string;
}

/**
 * Returns a configured LanguageModel instance based on environment variables,
 * or null if no API key is provided.
 */
export function getLanguageModel(override?: AiClientConfig): LanguageModel | null {
  const provider = (override?.provider || process.env.AI_PROVIDER || "gemini").toLowerCase();
  const apiKey = override?.apiKey || process.env.AI_API_KEY;
  const modelName = override?.model || process.env.AI_MODEL;

  if (!apiKey || !modelName) {
    return null;
  }

  if (provider === "google" || provider === "gemini") {
    const google = createGoogleGenerativeAI({ apiKey });
    return google(modelName);
  }

  if (provider === "groq") {
    const groq = createGroq({ apiKey });
    return groq(modelName);
  }

  if (provider === "nvidia" || provider === "openai-compatible") {
    const configured = override?.baseURL || process.env.AI_BASE_URL;
    const baseURL = provider === "nvidia" ? "https://integrate.api.nvidia.com/v1" : configured;
    if (!baseURL) return null;
    try {
      const parsed = new URL(baseURL);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    } catch {
      return null;
    }
    const custom = createOpenAICompatible({ name: provider, apiKey, baseURL });
    return custom(modelName);
  }

  return null;
}
