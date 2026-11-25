# API routes (`/api/v1`)

Update this table **in the same PR** as any route change. Status: `planned` (not started) →
`mocked` (frontend has a mock in `src/mocks/`) → `live` (merged on `main` with tests; frontend
deletes its mock). Schemas are the export names in `src/shared/schemas/<file>.ts`.
The machine-readable spec is served at `GET /api/v1/doc`.

Errors are always `{ "error": { "code", "message", "details" } }` (codes in `src/shared/errors.ts`).

| Method + path | Role | Lane | Request → response schema | Errors | Status |
|---|---|---|---|---|---|
| GET /health | public | A | → `{ ok, db }` | | live |
| GET /doc | public | A | → OpenAPI JSON | | live |
| POST /projects | contractor | A | | 400 | planned |
| GET /projects | members | A | (only member projects) | | planned |
| GET /projects/:id | members | A | | 404 | planned |
| POST /projects/:id/members | contractor | A | invite owner/engineer by email | 400 404 | planned |
| POST /projects/:id/materials | contractor | A | | 400 403 404 | planned |
| POST /projects/:id/workers | contractor | A | | 400 403 404 | planned |
| POST /projects/:id/deliveries | contractor | A | | 409 DUPLICATE_CHALLAN | planned |
| POST /projects/:id/usages | contractor | A | | 409 INSUFFICIENT_STOCK (+balance) | planned |
| POST /projects/:id/attendance | contractor | A | bulk for one date, snapshots rate | 400 409 | planned |
| GET /projects/:id/stock | members | A | balances | 404 | planned |
| GET /projects/:id/movements | members | A | history | 404 | planned |
| POST /projects/:id/wage-payments | contractor | C | kind wage/advance, mode cash/UPI/bank | 400 403 | planned |
| POST /projects/:id/adjustments | contractor | C | target, new value, reason ≥ 10 | 400 403 | planned |
| GET /projects/:id/summary | members | C | budget, spend split, burn rate, alerts (no wage split for engineer) | 404 | planned |
| GET /projects/:id/wage-sheet?from&to&format=pdf\|csv\|json | owner, contractor | C | | 403 404 | planned |
| POST /projects/:id/progress (multipart) | engineer, contractor | C | note + photos (jpg/png/webp ≤ 5 MB) | 400 403 | planned |
| GET /projects/:id/timeline | members | C | photos by day | 404 | planned |
| POST /projects/:id/proposals | engineer, contractor | C | | 400 403 | planned |
| POST /proposals/:id/decision | owner | C | approve / reject | 403 404 409 | planned |
| GET /projects/:id/activity | members | C | from audit_log | 404 | planned |
| POST /projects/:id/checklists?source=template\|ai | engineer | D | `ChecklistDraft` (checklist.ts) | 400 403 | planned |
| PATCH /checklist-items/:id | engineer | D | status only | 400 403 404 | planned |
