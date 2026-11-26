import { z } from "zod";

export const MAX_CHAT_MESSAGE_CHARS = 4000;
export const MAX_CHAT_MESSAGES = 20;
export const AssistantMessage = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(MAX_CHAT_MESSAGE_CHARS),
});
export const AssistantInput = z
  .strictObject({
    messages: z.array(AssistantMessage).min(1).max(MAX_CHAT_MESSAGES),
  })
  .refine(({ messages }) => messages.at(-1)?.role === "user", {
    path: ["messages"],
    message: "Send a user message as the final turn",
  });
export const AssistantResponse = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.enum(["ai", "prototype"]),
    reply: z.string().trim().min(1).max(12000),
  }),
  z.strictObject({ source: z.literal("offline"), message: z.string().min(1) }),
]);
export type AssistantMessage = z.infer<typeof AssistantMessage>;
export type AssistantInput = z.infer<typeof AssistantInput>;
export type AssistantResponse = z.infer<typeof AssistantResponse>;
