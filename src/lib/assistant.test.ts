import { describe, expect, it } from "vitest";
import { boldParts, type ChatTurn, historyToSend, parseAnswer } from "./assistant";

describe("historyToSend", () => {
  it("stays inside the route's limits and starts with a question", () => {
    const turns: ChatTurn[] = Array.from({ length: 61 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: "x".repeat(5000),
    }));
    const sent = historyToSend(turns);
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent[0].role).toBe("user");
    expect(sent.at(-1)?.role).toBe("user");
    expect(sent.every((t) => t.content.length === 4000)).toBe(true);
  });
});

describe("parseAnswer", () => {
  it("reads headings, both list kinds, tables and plain lines", () => {
    const blocks = parseAnswer(
      [
        "## Slab",
        "Volume is **14.2 m³**.",
        "",
        "- Cement",
        "* Sand",
        "1. Check formwork",
        "| Material | Qty |",
        "|---|---:|",
        "| Cement | 114 bags |",
        "Done",
      ].join("\n"),
    );
    expect(blocks).toEqual([
      { kind: "heading", text: "Slab" },
      { kind: "text", text: "Volume is **14.2 m³**." },
      { kind: "list", ordered: false, start: 1, items: ["Cement", "Sand"] },
      { kind: "list", ordered: true, start: 1, items: ["Check formwork"] },
      { kind: "table", head: ["Material", "Qty"], rows: [["Cement", "114 bags"]] },
      { kind: "text", text: "Done" },
    ]);
  });

  it("keeps step numbers when a sub-point splits the list", () => {
    const lists = parseAnswer("1. Formwork\n   - check props\n2. Steel").filter(
      (b) => b.kind === "list" && b.ordered,
    );
    expect(lists.map((b) => b.kind === "list" && b.start)).toEqual([1, 2]);
  });

  it("keeps a line that only starts with bold as text", () => {
    expect(parseAnswer("**Steel** at 1%")).toEqual([{ kind: "text", text: "**Steel** at 1%" }]);
    expect(boldParts("**Steel** at 1%")).toEqual(["", "Steel", " at 1%"]);
  });
});
