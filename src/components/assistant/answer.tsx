import { useMemo } from "react";
import { type Block, boldParts, parseAnswer } from "@/lib/assistant";

function Inline({ text }: { text: string }) {
  return boldParts(text).map((part, i) =>
    i % 2 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

function AnswerBlock({ block }: { block: Block }) {
  if (block.kind === "heading")
    return (
      <h3 className="font-serif text-xl leading-snug">
        <Inline text={block.text} />
      </h3>
    );
  if (block.kind === "text")
    return (
      <p>
        <Inline text={block.text} />
      </p>
    );
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return (
      <List
        start={block.ordered ? block.start : undefined}
        className={`flex flex-col gap-1.5 pl-5 marker:text-muted-foreground ${block.ordered ? "list-decimal" : "list-disc"}`}
      >
        {block.items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list from one answer
          <li key={i}>
            <Inline text={item} />
          </li>
        ))}
      </List>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <table className="num w-full text-left text-[15px]">
        <thead className="bg-secondary text-muted-foreground">
          <tr>
            {block.head.map((cell, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
              <th key={i} scope="col" className="px-3 py-2 font-semibold">
                <Inline text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed rows
            <tr key={i} className="border-t align-top">
              {row.map((cell, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed columns
                <td key={j} className="px-3 py-2">
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** One assistant answer, laid out as a document and not as a chat bubble. */
export function Answer({ source }: { source: string }) {
  // Typing in the question box re-renders the sheet; don't re-read every past answer.
  const blocks = useMemo(() => parseAnswer(source), [source]);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: an answer never changes after it arrives
        <AnswerBlock key={i} block={block} />
      ))}
    </div>
  );
}
