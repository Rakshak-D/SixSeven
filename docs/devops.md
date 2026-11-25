# DevOps (lane D)

## Postgres
- `docker compose up -d db` runs Postgres 16 (same as CI) on `${DB_PORT:-5432}`. Data persists in
  the `pgdata` volume; `docker compose down -v` wipes it.
- No Docker? Any local Postgres works: set `DATABASE_URL` in `.env`. Prefer 16 to match CI.

## CI (`.github/workflows/ci.yml`, push to main + every PR)
`pnpm install --frozen-lockfile → biome ci → typecheck → db:migrate (postgres:16 service) → vitest`.
Keep it minimal. Red for more than 15 min → skip the step and log it under "CI skips" in root
`AGENTS.md`. Watch a PR: `gh pr checks <n> --watch; echo $?`; failing log: `gh run view --log-failed`.

## Demo
`docker compose --profile app up -d --build` builds the app image (Next.js standalone on :3000)
next to the DB, then `pnpm db:migrate && pnpm db:seed` from the host. Needs `BETTER_AUTH_SECRET` in
`.env`. A hosted copy is a bonus only.

## Working between laptops
Tailscale. Each dev runs their own DB; share a running app with `pnpm dev:lan` and open
`http://<tailscale-ip>:3000` on the other laptop or phone.
