# Tests: `tests/`

Vitest against **real Postgres** (`docker compose up -d db && pnpm db:migrate` first). CI runs the
same: lint → typecheck → migrate → vitest. Playwright is local only.

- `tests/api/<route-file>.test.ts`: API tests, in-process via `app.request("/api/v1/...")`.
  Owned by the lane that owns the route. Each test creates its own project via helpers; never rely
  on another file's rows (files run one at a time, tests in a file in order).
- Unit tests sit next to the code (`src/**/x.test.ts`).
- `tests/e2e/`: Playwright (lane D), `pnpm test:e2e`, phone + desktop projects.
- One file: `pnpm exec vitest run tests/api/stock.test.ts`; one test: add `-t "name"`.

## Must pass before Round 2 (~20:00)

1. Usage beyond stock → 409, stock unchanged
2. Two usages at the same time can't push stock below 0
3. UPDATE on `stock_movements` raises (trigger)
4. Owner of project A gets 404 on project B
5. Owner can't POST a delivery (403)
6. Wage maths: 2 masons full + 1 helper half = exact paise
7. An adjustment changes effective attendance and keeps the original row
8. Duplicate challan → 409
9. Bad input → 400 with the standard error shape
10. Playwright: delivery → usage → attendance → chart changes → wage sheet downloads

Agents decide what else needs a test; keep it to rules that could silently break. Don't call real AI
models or external services in tests.
