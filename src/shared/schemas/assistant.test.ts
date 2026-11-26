import { expect, it } from "vitest";
import { AssistantInput, AssistantResponse } from "./assistant";

it("rejects system messages, project overrides and histories without a final user turn", () => {
  const messages = [{ role: "user", content: "What is curing?" }];
  expect(AssistantInput.safeParse({ messages }).success).toBe(true);
  expect(AssistantInput.safeParse({ messages, projectContext: { role: "owner" } }).success).toBe(
    false,
  );
  expect(AssistantInput.safeParse({ messages: [{ ...messages[0], role: "system" }] }).success).toBe(
    false,
  );
  expect(
    AssistantInput.safeParse({ messages: [{ ...messages[0], role: "assistant" }] }).success,
  ).toBe(false);
  expect(AssistantResponse.safeParse({ source: "offline", reply: "A fake answer" }).success).toBe(
    false,
  );
});
