# Frontend (lane B): `src/app/`, `src/components/`, `src/hooks/`, `src/lib/api/`, `src/mocks/`

Read the root `AGENTS.md` first. `src/app/api/` belongs to the backend, don't edit it.

## How data reaches a screen

- Every request goes through `api()` in `src/lib/api/client.ts`, always with the response schema
  from `src/shared/schemas/` so contract drift fails loudly. Wrap calls in TanStack Query hooks in
  `src/hooks/use-<resource>.ts`. No `fetch` in components.
- While a route isn't live, add a mock entry in `src/mocks/index.ts` (fixtures must pass the shared
  schema). With `NEXT_PUBLIC_USE_MOCKS=1` the client answers listed routes from mocks and everything
  else from the real API. When `docs/API.md` marks a route `live`, delete its mock in the same PR.
- Never invent fields the schema doesn't have. Need one? Ask the route's owner (contract rules in
  `src/shared/AGENTS.md`).

## Screens (Must first; Diff only after Must screens work on the real API)

| Screen | Route | Role | Priority |
|---|---|---|---|
| Login + 3 demo role buttons | `/login` | all | Must |
| Project list (budget used %, alerts) | `/projects` | all | Must |
| Project setup (budget, materials, workers) | `/projects/new` | contractor | Must |
| Today: Delivery, Usage, Attendance (P/½/A), Photo tabs | `/p/[id]/today` | contractor | Must |
| Stock: balances, low-stock badge, movements | `/p/[id]/stock` | members | Must |
| Owner dashboard: KPIs, budget-vs-spend chart, photo timeline, activity | `/p/[id]` | owner | Must |
| Wage sheet: range, table, totals, PDF/CSV, payments | `/p/[id]/wages` | owner, contractor | Must |
| Adjustments: form + old → new log | `/p/[id]/adjustments` | contractor (owner reads) | Must |
| Engineer: checklist, progress + photos, propose change | `/p/[id]/site` | engineer | Diff |
| Proposals: approve / reject | `/p/[id]/proposals` | owner | Diff |

Route groups `(auth) (contractor) (owner) (engineer)` exist for layouts; URLs above are what matter.

## UX rules

- Role decides navigation; hide buttons a role can't use (the server still checks).
- Every form: Zod validation inline (same shared schema as the API), loading state, success toast
  (`sonner`), and the server's `error.message` on failure.
- 409s read like advice: "Only 60 bags in stock. Log a delivery or an adjustment."
- Money only via `formatINR()` from `src/shared/money.ts`: ₹ with Indian grouping (₹25,00,000), whole
  rupees. Form inputs take rupees and convert with `rupeesToPaise()`.
- Contractor screens are phone-first: tap targets ≥ 44 px; attendance for 5 workers fits one screen
  with no scrolling. Owner screens are desktop-first but must work at 390 px.
- One accent colour. Status colours mean something: red = blocked / over budget, amber = low stock.
- Charts: shadcn `chart` (Recharts). Components: add with `pnpm dlx shadcn@latest add <name>`.
- No unrequested features. Stretch: Kannada labels on Today via a simple dictionary.

## Done means

`pnpm lint:fix && pnpm typecheck && pnpm test` pass, and you looked at the screen at 390 px and
1440 px (light and dark). Unit tests only for pure logic (formatters, mappers). The one Playwright flow
(`tests/e2e/`) runs locally before the demo.

## Gotchas

- `src/components/ui/` is shadcn-generated and excluded from Biome; put our own components in
  `src/components/` (not `ui/`).
