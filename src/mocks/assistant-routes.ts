/**
 * Demo answers for the site assistant. Fixed samples, not a model; the sheet labels them.
 * There is no shared schema for this route yet (frontend ledger, request 29).
 */
import type { MockRoute } from "./types";

const slab = `## Roof slab, 1200 sq ft at 5 in
Wet volume is **14.2 m³**. M20 (1:1.5:3), dry factor 1.54, before wastage.

| Material | Quantity |
|---|---|
| Cement (50 kg) | about 114 bags |
| Sand | about 5.9 m³ |
| Aggregate 20 mm | about 11.9 m³ |
| Steel Fe500 | 1,130 to 1,415 kg |

- Steel assumes 80 to 100 kg per m³. The bar schedule decides the real figure.
- Add 5 to 8% for wastage.`;

const wall = `## Brick wall, 50 ft × 10 ft, 9 in
Wall volume is **10.6 m³**. Mortar 1:6, no openings taken out.

| Material | Quantity |
|---|---|
| Bricks | about 5,300, or 5,565 with 5% breakage |
| Cement (50 kg) | about 18 bags |
| Sand | about 3.6 m³ |

- Take out doors and windows before ordering.`;

const pour = `## Before a slab pour
1. **Formwork:** check level, plumb, props and gaps.
2. **Steel:** check bar spacing, cover blocks and tied laps.
3. **Cleaning:** remove debris, sawdust and standing water.
4. **Conduits:** fix all pipes, sleeves and boxes in place.
5. **Concrete:** agree the slump and water-cement ratio before the first batch.`;

const other = `This demo has three sample answers: a **roof slab**, a **brick wall** and a **pre-pour check**. Pick one of the suggestions to see it.`;

export function sampleAnswer(question: string): string {
  const q = question.toLowerCase();
  if (q.includes("check")) return pour;
  if (q.includes("brick")) return wall;
  if (q.includes("slab")) return slab;
  return other;
}

export const assistantRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/projects/:id/ai/chat",
    respond: async ({ body }) => {
      await new Promise((done) => setTimeout(done, 600));
      const { messages } = body as { messages: { content: string }[] };
      return { reply: sampleAnswer(messages.at(-1)?.content ?? "") };
    },
  },
];
