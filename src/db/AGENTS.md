# Data (lane A): `src/db/`

Read the root `AGENTS.md` first. Drizzle + drizzle-kit on Postgres 16. `schema.ts` is lane A's;
`auth-schema.ts` holds Better Auth's generated tables (lane C).

## Migrations

- Change `schema.ts` → `pnpm db:generate` → commit the SQL in `migrations/` → `pnpm db:migrate`.
- Never edit or delete a migration that's on `main`; write a new one.
- Triggers, CHECKs drizzle can't express and views go in custom migrations:
  `pnpm db:generate --custom --name=ledger_triggers`.
- Schema locks at H3 (14:30). After that a schema change needs a quick team OK in chat.
- Two people generated migrations at once (number clash)? The later PR deletes its own migration,
  merges `main`, and regenerates.

## Types

- Money: `bigint("x_paise", { mode: "number" })`. Quantities: `numeric(14, 3)` with
  `{ mode: "number" }`. Never `real`/`double` for money or stock.
- ★ = append-only: a trigger raises on UPDATE and DELETE.

## Tables

| Table | Key columns | Rules |
|---|---|---|
| user, session, account | Better Auth | (auth-schema.ts) |
| projects | name, location, start_date, budget_paise, created_by | budget ≥ 0 |
| project_members | project_id, user_id, role owner/contractor/engineer | unique(project_id, user_id) |
| materials | project_id, name, unit, planned_qty, unit_cost_paise, tolerance_pct, low_stock_qty, stock_qty | CHECK stock_qty ≥ 0 (cached balance) |
| stock_movements ★ | material_id, type delivery/usage/adjustment, qty (signed), unit_cost_paise, supplier, challan_no, note, occurred_on, created_by | unique(project_id, supplier, challan_no) for deliveries |
| workers | project_id, name, category, daily_rate_paise, active | rate > 0 |
| attendance ★ | worker_id, work_date, half_days 0/1/2, rate_paise (snapshot), created_by | unique(worker_id, work_date) |
| wage_payments ★ | worker_id, amount_paise, kind wage/advance, mode cash/UPI/bank, reference, paid_on | amount > 0 |
| adjustments ★ | target_table, target_id, old_value jsonb, new_value jsonb, reason | reason ≥ 10 chars |
| expenses | category, amount_paise, note, spent_on | |
| progress_updates, photos | note, checklist_item_id; storage_key, mime, size_bytes, taken_on | jpg/png/webp ≤ 5 MB |
| checklists, checklist_items | title, source template/ai; phase, task, status, sort | |
| change_proposals | title, description, cost_impact_paise, status, decided_by, decided_at | only owner decides |
| audit_log ★ | actor_id, action, entity, entity_id, payload jsonb | written by the API on every write |

Every table has `id`, `project_id` (except auth tables) and `created_at`.

## Derived numbers: SQL views or service queries, never stored

- Effective attendance = latest adjustment value if any, else the original row.
- Accrued = Σ half_days × rate_paise / 2; due = accrued − paid wages − advances.
- Spend = Σ delivery qty × unit cost + accrued wages + expenses. Burn rate = spend / days since start.
- Variance per material = used vs planned, flagged above tolerance_pct (default 5 % cement, 10 % sand).

## Seed (`pnpm db:seed`, Faker `en_IN`, idempotent: wipe and reload)

Users owner@demo, contractor@demo, engineer@demo (password in README); project "Greenfield Home,
Chikkamagaluru", budget ₹25,00,000; cement / M-sand / TMT steel; 2 masons ₹900/day, 3 helpers ₹600/day;
7 days of history; a second owner's project to prove isolation.

## Tests

One test per ★ table proving UPDATE and DELETE raise. Concurrency: two usages at once can't push
stock below 0.
