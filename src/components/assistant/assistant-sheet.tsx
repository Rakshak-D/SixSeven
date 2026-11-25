"use client";

import { ArrowUp, ArrowUpRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { ApiClientError, api } from "@/lib/api/client";
import { type ChatTurn, historyToSend, MAX_MESSAGE_CHARS } from "@/lib/assistant";
import { mocksEnabled } from "@/mocks";
import type { ProjectResponse } from "@/shared/schemas/projects";
import { Answer } from "./answer";

const suggestions = [
  {
    label: "Concrete and steel for a slab",
    prompt: "Calculate concrete and steel for a 1200 sq.ft 5-inch thick RCC roof slab.",
  },
  {
    label: "Bricks and mortar for a wall",
    prompt: "Estimate bricks and cement mortar for a 10ft high, 50ft long 9-inch brick wall.",
  },
  {
    label: "Checks before a slab pour",
    prompt: "Give me a critical 5-step checklist before pouring a concrete slab.",
  },
];

/** Site questions: quantities, mixes and checks. It reads nothing from the logs and changes nothing. */
export function AssistantSheet({
  project,
  open,
  onOpenChange,
}: {
  project: ProjectResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // State lives here, above the dialog content, so closing the sheet keeps the conversation.
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<HTMLLIElement>(null);

  // Show the newest question at the top of the view, so a long answer is read from its start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the chat grows or reopens
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => latest.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [open, turns.length]);

  async function send(next: ChatTurn[]) {
    setTurns(next);
    setError(null);
    setBusy(true);
    try {
      const { reply } = await api<{ reply: string }>("POST", `/projects/${project.id}/ai/chat`, {
        body: {
          messages: historyToSend(next),
          // The server builds its prompt from these until it reads them itself (ledger request 30).
          projectContext: { name: project.name, location: project.location },
        },
      });
      // The route refuses empty messages, so a stored empty reply would fail every later request.
      if (!reply.trim()) throw new Error("Empty reply");
      setTurns([...next, { role: "assistant", content: reply }]);
    } catch (cause) {
      // Kept out of the conversation, so a failure is never sent back as something it said.
      // A 4xx (signed out, not a member) says why; anything else gets the general line.
      setError(
        cause instanceof ApiClientError && cause.status < 500
          ? cause.message
          : "No answer came back. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function ask(question: string) {
    const content = question.trim();
    if (!content || busy) return;
    setDraft("");
    // A question that failed is replaced by the new one.
    const kept = error ? turns.slice(0, -1) : turns;
    send([...kept, { role: "user", content }]);
  }

  const lastQuestion = turns.findLastIndex((t) => t.role === "user");

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ask Slate"
      description={`Quantities, mixes and site checks for ${project.name}.`}
      className="h-[calc(100dvh-3.5rem)] lg:h-auto lg:w-[460px]"
      footer={
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
        >
          <div className="flex items-end gap-2 rounded-[1.75rem] border border-line-strong bg-background p-1.5 pl-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            <textarea
              rows={1}
              value={draft}
              maxLength={MAX_MESSAGE_CHARS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                ask(draft);
              }}
              aria-label="Your question"
              placeholder="Ask a site question"
              className="field-sizing-content max-h-32 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
              <ArrowUp aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-2 text-center text-[13px] text-muted-foreground">
            Estimates can be wrong. Check them before you order or pour.
          </p>
        </form>
      }
    >
      {mocksEnabled ? (
        <p className="mb-4 rounded-2xl border border-dashed px-4 py-2.5 text-[15px] text-muted-foreground">
          Demo: these are fixed sample answers, not live AI.
        </p>
      ) : null}

      {turns.length === 0 ? (
        <>
          <h3 className="mb-2 font-semibold text-[15px] text-muted-foreground">Try one</h3>
          <ul className="flex flex-col gap-2">
            {suggestions.map(({ label, prompt }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => ask(prompt)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 rounded-3xl border bg-secondary px-4 py-3 text-left font-semibold transition-colors duration-(--duration-fast) ease-slate hover:border-line-strong"
                >
                  {label}
                  <ArrowUpRight aria-hidden="true" className="size-5 shrink-0 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <ol aria-live="polite" className="flex flex-col gap-5">
        {turns.map((turn, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: turns are only added or replaced at the end
            key={i}
            ref={i === lastQuestion ? latest : undefined}
            className="scroll-mt-1 animate-rise break-words"
          >
            {turn.role === "user" ? (
              <p className="ml-auto w-fit max-w-[88%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5">
                <span className="sr-only">You asked: </span>
                {turn.content}
              </p>
            ) : (
              <Answer source={turn.content} />
            )}
          </li>
        ))}
      </ol>

      {busy ? (
        <output className="mt-5 flex items-center gap-2.5 text-[15px] text-muted-foreground">
          <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-primary" />
          Working it out
        </output>
      ) : null}
      {error ? (
        <div role="alert" className="mt-5 flex flex-col items-start gap-2.5">
          <p className="text-[15px] text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => send(turns)}>
            Try again
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
