# Backend Ledger

Exclusive write ownership: Codex. Newest checkpoint first. Timestamp is IST.

## Entry — M0 local verification

- Timestamp: 2026-11-25 14:54:02+05:30
- Milestone/task ID: M0
- Branch: chore/coordination
- Scope and changes: verified coordination documentation, repository hygiene, install, and scaffold checks. No business implementation was added.
- Files affected: same files as the M0 repository foundation entry below, plus the sanitized .env.example and Compose password interpolation.
- API or database changes: none to runtime schemas, handlers, migrations, or seed. Compose now requires a local POSTGRES_PASSWORD rather than committing the previous default value.
- Verification commands and outcomes:
  - `corepack pnpm install --frozen-lockfile --store-dir <workspace>/.cache/pnpm-store` — PASS; pnpm 12.23.0, lockfile unchanged.
  - `corepack pnpm exec vitest run src/shared/money.test.ts` — PASS; 1 file, 3 tests.
  - `corepack pnpm typecheck` — PASS.
  - `corepack pnpm build` — PASS.
  - `corepack pnpm exec biome ci` — FAIL in this Windows checkout because repository files use CRLF while Biome's default expects LF; 45 formatting errors, no files changed.
  - `corepack pnpm exec biome ci --line-ending=crlf --javascript-formatter-line-ending=crlf --json-formatter-line-ending=crlf` — PASS; checked 45 files, no changes.
  - `docker compose -f docker-compose.yml config --quiet` — PASS; configuration parse only with process-only validation values, no service started.
  - `git diff --check` — PASS.
  - Full `corepack pnpm test` and `tests/api/health.test.ts` — NOT_RUN; health integration requires a reachable PostgreSQL database. No database or Docker service was started and no external database was accessed.
- Dependencies added: none.
- Known limitations: default Biome command is incompatible with the checked-out CRLF line endings on this Windows host; CRLF override passes. Full API/database suite is NOT_RUN. Remote CI remains to be observed after PR publication.
- Frontend implications: no frontend implementation files changed; ownership guidance and API contract documentation are Codex-owned. Claude's ledger remains unchanged.
- Commit or PR reference: pending publication.
- Next action: stage reviewed paths, commit and push only chore/coordination, then open an unmerged PR to main.

## Entry — M0 repository foundation

- Timestamp: 2026-11-25 14:34:24+05:30
- Milestone/task ID: M0
- Branch: chore/coordination
- Scope and changes: synchronized the verified remote scaffold; established two-owner instructions, Codex-owned API/operations docs, ledgers, disclosure record, branch/contract workflow, and local ignored cache/database paths.
- Files affected: AGENTS.md; nested AGENTS.md under src/app, src/components, src/db, src/server, src/server/ai, src/shared, and tests; README.md; docs/API.md; docs/devops.md; docs/PROJECT_LEDGER.md; docs/BACKEND_LEDGER.md; docs/DECISIONS.md; docs/DISCLOSURES.md; .gitignore; .dockerignore; docker-compose.yml. FRONTEND_LEDGER.md and frontend implementation files are unchanged.
- API or database changes: no runtime API, schema, migration, or seed implementation. docs/API.md records the existing scaffold contract and separates schema availability, backend readiness, and frontend integration. Compose data paths are configured inside ignored workspace-local .cache.
- Verification commands and outcomes: pending final M0 verification entry.
- Dependencies added: none. Existing locked dependencies are installed only for local verification under ignored workspace-local paths.
- Known limitations: full project specification and event deadline pending; no database was started; backend routes other than health and OpenAPI are scaffolds; PR not yet published at entry creation.
- Frontend implications: root and nested ownership now assigns frontend implementation to Claude, backend/contracts/infra to Codex. Frontend ledger requests for schemas and auth remain open pending specification; ownership request is answered. Codex did not modify the Claude-owned ledger.
- Commit or PR reference: pending.
- Next action: run only permitted local checks, commit, push chore/coordination, and open a PR. Do not merge without user approval.
