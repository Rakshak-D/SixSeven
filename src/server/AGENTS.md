# API (lanes A, C, D): `src/server/`

Read the root `AGENTS.md` first. Hono (`@hono/zod-openapi`) mounted at `/api/v1` by
`src/app/api/[[...route]]/route.ts`. Each lane owns its route files (table in root `AGENTS.md`).

## Every write request, in this order

session → `requireRole(projectId, roles)` → Zod (via `createRoute`) → service → **one DB
transaction** → `audit_log` row in that same transaction.

- Build routers with `createRouter()` (`lib/router.ts`) and routes with `createRoute()` using
  schemas from `src/shared/schemas/`. Never `new OpenAPIHono()` in a route file.
- All routers are already mounted in `app.ts`. Add routes inside your file; don't edit `app.ts`.
- Business logic lives in `services/` (`ledger.ts`, `wages.ts`, `reports.ts`); route handlers stay
  thin: validate, call service, return.
- Errors: `throw new ApiError(status, ErrorCode.X, message, details)` from
  `middleware/errors.ts`. Codes live in `src/shared/errors.ts`; add new ones there.
  400 `VALIDATION_ERROR` · 401 not logged in · 403 wrong role · 404 not a member of that project
  (never 403: don't reveal it exists) · 409 rule broken (`INSUFFICIENT_STOCK` with the balance,
  `DUPLICATE_CHALLAN`) · 500 logs a request id, never sends a stack trace.
- Update `docs/API.md` (status `planned → mocked → live`) in the same PR as the route.

## Rules that protect the pitch

- Stock never goes below 0, even with two users at once. Usage is one guarded statement, never
  "read balance, then decrement":
  ```sql
  UPDATE materials SET stock_qty = stock_qty - $q
  WHERE id = $id AND project_id = $p AND stock_qty >= $q
  RETURNING stock_qty;   -- 0 rows → rollback, 409 INSUFFICIENT_STOCK; else INSERT stock_movements
  ```
- Ledger tables are append-only; a correction is an `adjustments` row with a reason ≥ 10 chars plus
  a compensating movement or superseding value.
- Wage maths (`services/wages.ts`): day wage = `rate_paise × half_days / 2` (half_days ∈ 0/1/2, so
  exact). Sum in SQL as bigint. Accrued − paid − advances = due. Format only at the edge.
- Engineers never see the wage split in `/summary`.
- CSV export escapes cells starting with `= + - @` (formula injection).
- Uploads: jpg/png/webp only, ≤ 5 MB, saved under `UPLOAD_DIR` by a storage driver (local disk now).

## Tests (minimum; add more where a rule is subtle)

Per route: one happy-path test + one test per 4xx rule it enforces, against real Postgres, in
`tests/api/<route-file>.test.ts`. Call the app in-process: `app.request("/api/v1/...")`.
