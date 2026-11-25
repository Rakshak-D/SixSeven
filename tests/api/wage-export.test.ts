import { describe, expect, it } from "vitest";
import { wageSheetCsv, wageSheetPdf } from "@/server/services/wages";
import { WageSheetResponse } from "@/shared/schemas/wages";

const report = WageSheetResponse.parse({
  from: "2026-11-26",
  to: "2026-11-26",
  workers: [
    {
      workerId: "worker-1",
      name: '=Crew, "A"',
      halfDays: 1,
      accruedPaise: 45_000,
      paidWagesPaise: 100_000,
      advancesPaise: 0,
      duePaise: -55_000,
    },
  ],
  totals: {
    accruedPaise: 45_000,
    paidWagesPaise: 100_000,
    advancesPaise: 0,
    duePaise: -55_000,
  },
});

describe("wage sheet exports", () => {
  it("neutralizes formulas and quotes commas and quotes in CSV text cells", () => {
    const csv = wageSheetCsv("Greenfield, Home", report);
    expect(csv).toContain('Project,"Greenfield, Home"');
    expect(csv).toContain('worker-1,"\'=Crew, ""A""",1,45000,100000,0,-55000');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("generates a readable PDF with exact paise-to-INR formatting", async () => {
    const pdf = await wageSheetPdf("Greenfield Home", report);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const readable = Array.from(pdf.toString("latin1").matchAll(/<([0-9a-f]+)>/g), ([, hex]) =>
      Buffer.from(hex, "hex").toString("latin1"),
    ).join("");
    expect(readable).toContain("Slate Wage Sheet");
    expect(readable).toContain("INR 450.00");
    expect(readable).toContain("-INR 550.00");
    expect(readable).not.toContain("₹");
  });
});
