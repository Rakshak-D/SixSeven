<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SixSeven: rules for every lane

Problem 21: construction site progress + material tracker. One Next.js 16 app (App Router) with a
Hono REST API at `/api/v1`, Drizzle on Postgres 16, Better Auth, shadcn/ui. Our pitch is a
tamper-evident ledger: nothing can be quietly edited, stock can't go negative, owners approve changes.

**This file is the source of the rules.** Every `CLAUDE.md` only imports the `AGENTS.md` beside it.
Edit `AGENTS.md`, never `CLAUDE.md`. Before editing a folder, read the `AGENTS.md` in that folder.

## Lanes and file ownership

Touch only your lane's files. Need a change in someone else's file? Ask in team chat first.

| Lane | Owner | Owns |
|---|---|---|
| A: Data + backend core | _name_ (Codex) | `src/db/schema.ts`, `src/db/migrations/`, `src/db/seed.ts`, `src/server/middleware/errors.ts`, routes `projects materials workers deliveries usages attendance stock`, `services/ledger.ts` |
| B: Frontend | _name_ (Claude) | `src/app/**` (except `api/`), `src/components/`, `src/hooks/`, `src/lib/api/`, `src/mocks/` |
| C: Backend features + reports | _name_ (Codex) | `src/db/auth-schema.ts`, `src/server/middleware/{auth,requireRole}.ts`, routes `wagePayments adjustments summary wageSheet progress proposals activity`, `services/{wages,reports}.ts` |
| D: AI + DevOps + docs | _name_ (Claude) | `src/server/ai/`, route `checklists`, `.github/`, `Dockerfile`, `docker-compose.yml`, `tests/e2e/`, `README.md`, `docs/devops.md` |
| Shared (anyone, see rules) | all | `src/shared/`, `docs/API.md`, `package.json` + `pnpm-lock.yaml`, this file |

Every router is already mounted in `src/server/app.ts`; add routes inside your own route file and
never edit `app.ts`. No barrel `index.ts` files: import from the exact file (they cause conflicts).

## Never break these

- Money is integer **paise**: Postgres `bigint` (Drizzle `mode: "number"`), plain integers in JSON.
  Convert only with `src/shared/money.ts`. Never floats, never rupees in storage.
- Ledger tables are append-only: `stock_movements`, `attendance`, `wage_payments`, `adjustments`,
  `audit_log`. Never UPDATE or DELETE them (DB triggers block it). Corrections are new `adjustments` rows.
- Every route: Zod schema from `src/shared/schemas/`, `requireRole(projectId, roles)`, the standard
  error shape `{ error: { code, message, details } }`. Another project's id → 404, not 403.
- Only contractors create ledger entries. Owners read and approve proposals. Engineers do checklists,
  progress photos and proposals.
- No hard-coded data in UI; data comes from the API (or `src/mocks/` until the route is live).
  Demo data comes from `pnpm db:seed`.
- Never commit `.env`, keys, or uploads. Secrets live only in `.env`.

## Commands (run in this order)

```bash
pnpm install                      # once, and after pulling a package.json change
cp .env.example .env              # once
docker compose up -d db           # Postgres 16 on :5432
pnpm db:migrate && pnpm db:seed
pnpm dev                          # http://localhost:3000 ; `pnpm dev:lan` to share over Tailscale
pnpm lint:fix && pnpm typecheck && pnpm test   # before every commit; must pass before "done"
pnpm exec vitest run tests/api/health.test.ts  # one file;  add  -t "name"  for one test
```

## Contract between frontend and backend

- `src/shared/schemas/<resource>.ts` holds the Zod request/response schemas both sides import.
  Adding a new schema file: anyone, anytime. **Changing an exported schema**: say it in team chat,
  then a PR that touches only `src/shared/`, merged before the code that relies on it.
- `docs/API.md` lists every route with status `planned → mocked → live`. Update it **in the same PR**
  as any route change. The OpenAPI JSON at `/api/v1/doc` is generated from the same Zod.

## Git, PRs and CI

- Branch from fresh `main`: `<lane>/<topic>` with lanes `db/ be/ fe/ ai/ ops/` (e.g. `fe/today-screen`).
  Never commit to `main` directly. Merge `main` into your branch every 1–2 h; `main` must always run.
- Commits: conventional messages (`feat(stock): block usage beyond balance`). **No `Co-Authored-By`
  and no AI-assisted lines or trailers of any kind.** Commit from your own GitHub account.
- Push, open a PR (`gh pr create --fill`), then watch CI in the background:
  `gh pr checks <n> --watch; echo $?`. Judge by the exit code, never a tail of the output. Red →
  read the failing log (`gh run view --log-failed`), fix, push again, repeat until green.
- Self-review non-trivial PRs (Claude: `/code-review` or the `pr-review` agent; Codex: `/review`) and
  fix what it finds. No human review is required: squash-merge your own PR once CI is green.
- `git status` before every push. Never force-push to `main`; never delete someone else's branch.

## Dependencies

All planned dependencies are installed already. Adding one: its own small PR touching only
`package.json`, `pnpm-lock.yaml` and the README licence table, merged right away. Lockfile conflict:
never hand-merge it; take `main`'s `pnpm-lock.yaml` and rerun `pnpm install`.

## Module guides (read the one for the folder you're in)

`src/app/AGENTS.md` frontend · `src/server/AGENTS.md` API · `src/server/ai/AGENTS.md` AI checklist ·
`src/db/AGENTS.md` data · `src/shared/AGENTS.md` contract · `tests/AGENTS.md` testing ·
`docs/API.md` route table · `docs/devops.md` Docker, CI, Tailscale.
Decisions (read-only): [Final Decisions](https://claude.ai/artifact/Nfi1VESoFrZ5WGyScxnQqq) ·
[Build Plan](https://claude.ai/artifact/1itfmL6qd1KP7AWUkcgtzX). Feature freeze H18 (05:30), code freeze 11:30.

## Not built (on purpose)

Offline/PWA, GPS or biometrics on attendance, blockchain, invoice/challan OCR, PF/ESI, GST invoices,
multi-organisation, UPI reconciliation, AI image recognition of progress. Don't add them.

## Gotchas

Add one line each time a mistake costs a retry: what went wrong and the habit that prevents it.

- Sub-routers don't inherit `defaultHook`: build every router with `createRouter()` from
  `src/server/lib/router.ts`, or Zod errors skip the standard error shape.
- `next dev` rewrites the Next.js block at the top of this file; commit it, don't fight it.
- `next.config.ts` needs its `turbopack.rules["*.css"]` loader (`@tailwindcss/turbopack`); without
  it the build fails with "Can't resolve 'tw-animate-css'". Edit the config, don't replace it.
- Postgres: Docker is only for Postgres 16 parity with CI. Native Postgres is fine; point
  `DATABASE_URL` at it.

## CI skips

If a CI step stays broken for more than 15 min, skip it in `ci.yml` and log it here (step, why, who).

- _none yet_
