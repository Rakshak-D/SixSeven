import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseBoq } from "./boq";

const cell = (ref: string, value: string | number) =>
  typeof value === "number"
    ? `<c r="${ref}"><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`;

function workbook(rows: (string | number | undefined)[][]) {
  const body = rows
    .map(
      (row, r) =>
        `<row r="${r + 1}">${row
          .map((v, c) => (v === undefined ? "" : cell(`${"ABCDEF"[c]}${r + 1}`, v)))
          .join("")}</row>`,
    )
    .join("");
  return zipSync({
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${body}</sheetData></worksheet>`),
  });
}

const header = ["Category", "Level", "Type", "Count", "Quantity", "Unit"];

describe("parseBoq", () => {
  it("sums rows per category and unit and skips title and subtotal rows", () => {
    const boq = parseBoq(
      workbook([
        ["Bill of quantities"],
        [],
        header,
        ["Slabs", "Level A", "200 mm", 2, 10.1234, "m3"],
        ["Slabs", "Level B", "200 mm", 1, 5.5, "m3"],
        [undefined, undefined, "Slabs subtotal", 3, 15.6234, "m3"],
        ["Rails", "Level B", "Steel", 4, 12, "m"],
      ]),
    );
    expect(boq.lines).toEqual([
      { category: "Slabs", unit: "m3", qty: 15.623, levels: ["Level A", "Level B"] },
      { category: "Rails", unit: "m", qty: 12, levels: ["Level B"] },
    ]);
    expect(boq.levels).toEqual(["Level A", "Level B"]);
  });

  it("rejects other layouts and non-xlsx files", () => {
    expect(() => parseBoq(workbook([["Name", "Qty"]]))).toThrow(/not supported/);
    expect(() => parseBoq(strToU8("plain text"))).toThrow(/not an .xlsx/);
  });
});
