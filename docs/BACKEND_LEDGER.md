# Backend Ledger

Exclusive write ownership: Codex. Newest checkpoint first. Timestamp is IST.

## Entry — M3 material and stock operations

- Timestamp: 2026-11-25 16:20:28+05:30
- Milestone/task ID: M3
- Branch: be/material-stock
- Scope: eight published routes, role checks and exact PostgreSQL stock movements with transactional audit records. Greenfield Home seed now includes six idempotent deliveries and usages.
- Files: inventory and stock services and routes, seed, PostgreSQL CI and API integration tests, and API/project documentation.
- API or database changes: existing response schemas and migrations reused. Overflow returns 409 CONFLICT, low-stock comparison is inclusive, and history uses a stable newest-first sort.
- Verification: 28 shared tests, typecheck, production build and Biome on an LF snapshot passed locally. [PR #8 CI #19](https://github.com/Rakshak-D/SixSeven/actions/runs/45598875957) passed all 64 tests. Two blocked PostgreSQL connections were observed in each race. From 100 units, competing uses of 70 left 30, one usage and one usage audit. Competing identical challans left one movement and one audit. Audit failure rolled back stock and the movement. Both seed snapshots matched.
- Dependencies added: none.
- Limits: no authorized isolated local PostgreSQL instance was available. General adjustments are deferred.
- Frontend implications: delivery and usage now return the committed balance; the stock and movement endpoints are backed by PostgreSQL.
- Git reference: be/material-stock from 825829991eb3109ac6ee30c424a1b513818da87e.
- Next action: verify the stock and concurrency cases in CI before merging.

## Entry — M2 auth and project access

- Timestamp: 2026-11-25 15:59:48+05:30
- Milestone/task ID: M2
- Branch: be/auth-projects
- Scope: real Better Auth sessions and credentials, approved auth bridge, scoped project access, repeatable demo seed and core Drizzle tables.
- Files: database config, schema, seed and migrations; Next auth bridge and backend auth/project services and routes; API integration tests, PostgreSQL CI and development docs.
- API or database changes: enabled the three published auth operations and four project operations. Added migrations 0001_auth_projects and 0002_stock_ledger_guards. Project creation, membership assignment and audit writes are transactional.
- Verification: 28 shared tests, typecheck, production build, local OpenAPI/registration smoke check and Compose configuration parsing passed. Database integration runs in CI against a disposable PostgreSQL 16 service.
- First hosted run #15 passed migrations, both seed executions and project/database cases. Two assertions caught Better Auth's default origin-check bypass in test mode. The configuration now enables native origin and CSRF checks explicitly in every environment.
- [PR #7 CI run #16](https://github.com/Rakshak-D/SixSeven/actions/runs/45595922271) passed on implementation commit 0426f9e711f3e2ec625cf88ae85e79fbeb0d9217. Fresh migration and two demo seed runs succeeded. All 45 tests passed, including baseline upgrade, trusted origins, session revocation, membership isolation, rollback and direct database constraints.
- Dependencies added: none.
- Limits: no authorized isolated local PostgreSQL instance was available. No local database or Docker service was started. Delivery and usage business workflows remain planned.
- Frontend implications: the published auth and project response contracts are unchanged. The backend exposes real cookies and project-scoped roles.
- Git reference: be/auth-projects from 3c794317efe4377376ca9a1a1f7b813102546b9b (M1 merge).
- Next action: merge after the final PR head passes CI, then verify main.

## Entry — M1 shared API contracts

- Timestamp: 2026-11-25 15:37:00+05:30
- Milestone/task ID: M1
- Branch: be/api-contracts
- Scope: published P0–P2 browser-safe Zod schemas and inferred types using the approved historical baseline. See SPECIFICATION.md and API.md for domain rules and request/response details.
- Files: src/shared/schemas, src/shared/errors.ts, API/specification and project ledgers, README and approved-baseline references in agent guides.
- API or database changes: contract definitions only. No deployed auth or domain endpoints, database migrations, or provider configuration.
- Verification: shared Vitest suite passed 28 tests across 2 files, including the API examples and role-sensitive shapes. Typecheck, production build, and a browser-targeted bundle of all public contract modules passed. Scoped Biome passed, and full Biome passed on a project-local Git index snapshot with LF checkout to avoid Windows CRLF conversion. The staged diff passed whitespace and scope checks.
- Dependencies added: none.
- Limitations: local database-dependent tests were not run. CI uses ephemeral PostgreSQL for the existing scaffold checks. API documentation tracks runtime readiness independently from contract availability.
- Frontend implications: shared schema and auth requests are addressed at the contract level. Auth and multipart/binary routes have separate transport requirements from the JSON client.
- Git reference: be/api-contracts, branched from main 9bc2244795d2c5aa464b918a250ce200fa091ee9 after PR #5 merged.
- Next action: integrate the contract PR, then implement auth and membership in the next authorized milestone.

## Entry — M0 integration

- Timestamp: 2026-11-25 15:12:14+05:30
- Milestone/task ID: M0 closure
- Branch: main for integration, chore/m0-closure for this ledger update.
- Scope and changes: merged the approved coordination foundation and fast-forwarded local main.
- Files affected by this closure record: docs/PROJECT_LEDGER.md and docs/BACKEND_LEDGER.md.
- API or database changes: none.
- Verification: PR #3 matched reviewed head aa1b3c6d97b8c7bb225998adf8247b599b982ea0 and passed CI run #8. The merge commit has the expected parents and matches the reviewed tree. Post-merge `git diff --check`, `corepack pnpm exec vitest run src/shared/money.test.ts` (3 tests), and `corepack pnpm typecheck` passed.
- [Main CI run #10](https://github.com/Rakshak-D/SixSeven/actions/runs/45587831421) passed on the merge commit, including migration and the Vitest suite against CI PostgreSQL.
- Dependencies added: none.
- Known limitations: the PostgreSQL suite was not run locally because no isolated local database was started.
- Frontend implications: no API contract changes.
- Commit or PR reference: [PR #3](https://github.com/Rakshak-D/SixSeven/pull/3) merged as ac00d971e80b42508a3a85c9b184a1b70b47b0bf.
- Next action: take in the complete project specification before defining backend contracts.

## Entry — M0 publication

- Timestamp: 2026-11-25 15:01:20+05:30
- Milestone/task ID: M0
- Branch: chore/coordination
- Scope and changes: pushed the reviewed M0 coordination foundation and opened PR #3 against main; updated the project status and publication references.
- Files affected: docs/PROJECT_LEDGER.md and docs/BACKEND_LEDGER.md.
- API or database changes: none.
- Verification commands and outcomes: `git push --set-upstream origin chore/coordination` — PASS. GitHub PR #3 is open and mergeable with base main SHA 29b06094031f1fab470aa3c648c2ff2734af7e73. GitHub Actions CI run #6 for foundation commit 7941f25fe38365cb851732ffd1c0996d6c3f30ac — PASS; run #7 for the ledger publication commit 7306ca846a2390a976cdd5574259ab9758b1ae05 — PASS.
- Dependencies added: none.
- Known limitations: PR is unmerged by instruction. INTEGRATED status is not applicable until merge and integration testing; the PostgreSQL-dependent suite remains NOT_RUN as recorded below.
- Frontend implications: none; no frontend implementation or Claude-owned ledger changed.
- Commit or PR reference: foundation commit 7941f25fe38365cb851732ffd1c0996d6c3f30ac; ledger publication commit 7306ca846a2390a976cdd5574259ab9758b1ae05; [PR #3](https://github.com/Rakshak-D/SixSeven/pull/3).
- Next action: await technical-lead review. Do not merge before explicit foundation approval. Do not begin business-feature implementation until the full specification and next milestone are authorized.

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
- Known limitations: default Biome command is incompatible with the checked-out CRLF line endings on this Windows host; CRLF override passes. Full API/database suite is NOT_RUN. At this checkpoint PR publication and its CI run were still pending; see the newer publication entry.
- Frontend implications: no frontend implementation files changed; ownership guidance and API contract documentation are Codex-owned. Claude's ledger remains unchanged.
- Commit or PR reference: foundation commit 7941f25fe38365cb851732ffd1c0996d6c3f30ac; PR #3 publication is recorded in the newer checkpoint above.
- Next action: publication was completed in the newer checkpoint; await user review and approval without merging.

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
