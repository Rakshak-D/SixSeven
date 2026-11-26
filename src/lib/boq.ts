import { strFromU8, unzipSync } from "fflate";

/** One material line from a quantity take-off: every row of one category and unit, summed. */
export type BoqLine = { category: string; unit: string; qty: number; levels: string[] };
export type Boq = { lines: BoqLine[]; levels: string[] };

const HEADERS = ["category", "level", "type", "count", "quantity", "unit"];

const decode = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const textOf = (xml: string) =>
  decode(Array.from(xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g), (m) => m[1]).join(""));

/** Rows of sheet 1 as column letter → cell text, for columns A to F. */
function readRows(files: Record<string, Uint8Array>) {
  const sheet = files["xl/worksheets/sheet1.xml"];
  if (!sheet) throw new Error("This file has no first sheet. Upload the Revit quantity export.");
  const sharedXml = files["xl/sharedStrings.xml"];
  const shared = sharedXml
    ? Array.from(strFromU8(sharedXml).matchAll(/<si>([\s\S]*?)<\/si>/g), (m) => textOf(m[1]))
    : [];
  const rows: Record<string, string>[] = [];
  for (const [, body] of strFromU8(sheet).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Record<string, string> = {};
    for (const [, col, attrs, inner] of body.matchAll(
      /<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      if (!inner || col.length > 1 || col > "F") continue;
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const value = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const text =
        type === "s"
          ? (shared[Number(value)] ?? "")
          : type === "inlineStr"
            ? textOf(inner)
            : decode(value ?? "");
      if (text.trim()) row[col] = text.trim();
    }
    rows.push(row);
  }
  return rows;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Reads a Revit quantity take-off export (.xlsx): sheet 1, columns Category, Level, Type, Count,
 * Quantity, Unit under a header row. Title and subtotal rows (no category) are skipped. Returns one
 * line per category and unit, and the levels in the order they first appear.
 */
export function parseBoq(file: Uint8Array): Boq {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(file);
  } catch {
    throw new Error("This is not an .xlsx file. Export the quantities from Revit as .xlsx.");
  }
  const rows = readRows(files);
  const header = rows.findIndex((row) =>
    HEADERS.every((name, i) => row[String.fromCharCode(65 + i)]?.toLowerCase() === name),
  );
  if (header < 0) {
    throw new Error(
      "Columns A to F must be Category, Level, Type, Count, Quantity and Unit. This layout is not supported.",
    );
  }
  const lines = new Map<string, BoqLine>();
  const levels: string[] = [];
  for (const row of rows.slice(header + 1)) {
    const category = row.A;
    const level = row.B;
    const unit = row.F;
    const qty = Number(row.E);
    if (!category || !level || !unit || !Number.isFinite(qty) || qty <= 0) continue;
    const key = `${category}\u0000${unit}`;
    const line = lines.get(key) ?? { category, unit, qty: 0, levels: [] };
    line.qty += qty;
    if (!line.levels.includes(level)) line.levels.push(level);
    lines.set(key, line);
    if (!levels.includes(level)) levels.push(level);
  }
  if (!lines.size) throw new Error("No quantity rows were found under the header.");
  return {
    lines: [...lines.values()].map((line) => ({ ...line, qty: round3(line.qty) })),
    levels,
  };
}
