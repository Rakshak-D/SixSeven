/**
 * Helpers for the site assistant: what gets sent as chat history, and a small reader for the
 * markdown the model is asked to answer in (headings, lists, tables, bold). No HTML is ever built
 * from the answer; components render these blocks as text.
 */

import {
  type AssistantMessage,
  MAX_CHAT_MESSAGE_CHARS,
  MAX_CHAT_MESSAGES,
} from "@/shared/schemas/assistant";

export type ChatTurn = AssistantMessage;
export const MAX_MESSAGE_CHARS = MAX_CHAT_MESSAGE_CHARS;

export function historyToSend(turns: ChatTurn[]): ChatTurn[] {
  const recent = turns.slice(-MAX_CHAT_MESSAGES);
  const start = recent.findIndex((turn) => turn.role === "user");
  return recent.slice(Math.max(start, 0)).map(({ role, content }) => ({
    role,
    content: content.slice(0, MAX_MESSAGE_CHARS),
  }));
}

export type Block =
  | { kind: "heading"; text: string }
  | { kind: "text"; text: string }
  | { kind: "list"; ordered: boolean; start: number; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] };

const BULLET = /^(?:[-*•])\s+(.*)$/;
const NUMBERED = /^(\d+)[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;
const DIVIDER = /^\|[\s|:-]+\|$/;

const cells = (line: string) =>
  line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function parseAnswer(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n").map((l) => l.trim());
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^(-{3,}|\*{3,}|```.*)$/.test(line)) continue;

    if (line.startsWith("|") && DIVIDER.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; lines[i]?.startsWith("|"); i++) rows.push(cells(lines[i]));
      i--;
      blocks.push({ kind: "table", head, rows });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", text: heading[1] });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const item = bullet?.[1] ?? numbered?.[2];
    if (item !== undefined) {
      const ordered = !bullet;
      const last = blocks.at(-1);
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      // The source number is kept, so steps split by a sub-point don't restart at 1.
      else blocks.push({ kind: "list", ordered, start: Number(numbered?.[1] ?? 1), items: [item] });
      continue;
    }

    blocks.push({ kind: "text", text: line });
  }
  return blocks;
}

/** Splits on `**bold**`; odd positions are the bold parts. */
export const boldParts = (text: string) => text.split(/\*\*(.+?)\*\*/g);
