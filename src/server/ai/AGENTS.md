# AI checklist (lane D, stretch): `src/server/ai/`

Start only after H15 and only if all Must-haves are green. AI drafts; the engineer edits and saves.

- Flow: engineer uploads a site plan image (or types house type, floors, rooms) →
  `POST /projects/:id/checklists?source=ai` → this folder calls the model → editable draft rows →
  engineer saves → rows stored with `source='ai'`.
- Use AI SDK `generateText` with `Output.object({ schema })`; the schema is in
  `src/shared/schemas/checklist.ts` (phase enum, task ≤ 120 chars, ≤ 5 materials, ≤ 40 items).
- Provider from env only: `AI_PROVIDER` = `groq` (`@ai-sdk/groq`) | `gemini` (`@ai-sdk/google`) |
  `nvidia` (`@ai-sdk/openai-compatible` + NIM base URL), plus `AI_MODEL`, `AI_API_KEY`. Keys never in git.
- Always-works fallback: no key, a 20 s timeout, or output failing Zod → load the G+1 house template
  (`checklistTemplates.ts` here). The UI badge says "AI-suggested" or "Template".
- Honesty: README names the provider and model. Pitch line: "AI drafts, engineer decides".
- Tests: the fallback path (no key → template) must have a test; don't call real models in CI.
