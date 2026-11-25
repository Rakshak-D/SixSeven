<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Slate by SixSeven: project rules

## Scope and authority

The technical lead approved the repository baseline in M1. Use [docs/SPECIFICATION.md](docs/SPECIFICATION.md) for domain requirements and implement only the authorized milestone.

The approved baseline comes from repository history. Consult the specification and API contract before implementation. An external link counts as read only after it is successfully accessed.

## Repository architecture currently present

The scaffold uses one Next.js App Router application with Hono mounted at /api/v1, Drizzle and PostgreSQL, Better Auth dependencies, shared Zod schemas, and generated OpenAPI documentation. Keep this approved topology unless the technical lead authorizes a change. This describes the repository; it does not mean each subsystem or feature is implemented.

The repository is public. Treat every committed file as public. The current default branch is main. At M0 inspection, GitHub reported main as unprotected and no repository rulesets; the PR-only process below is therefore required.

## Canonical instructions

AGENTS.md is the canonical instruction source. Root and nested CLAUDE.md files must continue to import or reference the AGENTS.md beside them using the repository's existing @AGENTS.md mechanism. Codex maintains AGENTS.md files. Do not edit CLAUDE.md unless the import mechanism needs a coordinated correction.

Before editing a directory, read its AGENTS.md and the root PROJECT_LEDGER.md, BACKEND_LEDGER.md, FRONTEND_LEDGER.md, DECISIONS.md, and docs/API.md as relevant. An instruction file does not prove the feature it describes exists.

## Ownership

| Owner | Paths and responsibilities |
|---|---|
| Codex | src/db/**; src/server/** including src/server/ai/**; src/app/api/[[...route]]/route.ts; src/shared/** and shared API schemas; docs/API.md; backend and integration tests including tests/api/** and backend/shared unit tests; package.json, pnpm-lock.yaml, pnpm-workspace.yaml; CI, build, database, container, deployment and repository hygiene configuration; README.md and docs/devops.md; every AGENTS.md file; PROJECT_LEDGER.md, BACKEND_LEDGER.md, DECISIONS.md, DISCLOSURES.md; overall coordination. |
| Claude | Frontend implementation files in src/app/** except src/app/api/**; src/components/**; src/hooks/**; src/lib/api/**; src/mocks/**; frontend-specific tests and tests/e2e/**; docs/FRONTEND_LEDGER.md after initialization. AGENTS.md and CLAUDE.md instruction files are excluded. |

Codex maintains all AGENTS.md files, including nested guidance located inside Claude-owned directories. Claude reads those instructions but does not edit them.

Codex must not edit frontend-owned implementation files without an explicitly coordinated handoff. Claude must not implement API routes, database access, authentication or authorization logic, or competing request/response schemas.

### Mixed concerns and handoffs

- src/app/api/[[...route]]/route.ts is the Next.js-to-Hono server bridge and is owned by Codex. src/server/app.ts and route modules are also Codex-owned.
- src/app/layout.tsx, page files, client providers, and visual components are Claude-owned. A change there that alters server wiring or an API assumption needs a handoff before editing.
- Root manifests, lockfiles, .env.example, GitHub workflows, Docker files, and shared build/lint configuration are Codex-owned. Claude records dependency or config requests in FRONTEND_LEDGER.md; Codex reviews and implements them.
- src/shared/** and docs/API.md are Codex-owned contract sources. Claude requests changes in FRONTEND_LEDGER.md or a GitHub issue; Codex evaluates and updates the canonical contract.
- tests/api/** and backend integration tests are Codex-owned. Frontend-specific tests are Claude-owned. Cross-stack end-to-end acceptance work must be assigned in PROJECT_LEDGER.md before either side edits shared test setup.
- docs/FRONTEND_LEDGER.md is exclusively written by Claude after initialization. Codex reads it and records responses in BACKEND_LEDGER.md or the API contract without editing Claude's ledger.

A handoff names the files, reason, expected change, branch/commit, and checks. Keep the change in the receiving owner's lane where possible. For a file with unavoidable mixed ownership, agree on the handoff in the relevant ledger or issue before editing; review both sides before integration.

## Contract-first parallel work

The shared Zod schemas in src/shared/** and docs/API.md are the single API contract. Codex defines method, path, authentication, authorization, request and response schemas, and errors before feature implementation. Keep frontend-safe schemas free of database drivers, server-only modules, secrets, and runtime-only imports.

Claude may use only development fixtures derived from the agreed shared contract. Mark mock data clearly in the UI and in FRONTEND_LEDGER.md; never return a fake success that looks live. Keep contract availability, backend readiness, and frontend integration as separate statuses. Breaking contract changes require coordination and a contract-only integration step before dependent work is merged.

## Branches and integration

Use:
- main for the stable integrated application
- chore/coordination for repository workflow and coordination
- db/<topic> for database work
- be/<topic> for backend features
- ai/<topic> for AI integrations
- ops/<topic> for infrastructure
- fe/<topic> for frontend work owned exclusively by Claude

Before each implementation task:
1. Verify the branch and clean working-tree status.
2. Fetch remote changes and confirm the exact main base.
3. Read the latest API contract and both relevant ledgers.
4. Check whether main or an active branch changed the intended files.
5. Confirm every planned file belongs to the current owner's lane.

Create feature branches from the latest verified main. Do not create a branch for Claude's lane on Claude's behalf. Never commit or push directly to main. Use pull requests and merge commits so active branch ancestry remains synchronizable. When an active branch needs main, merge main into it with a merge commit; do not rebase or force-push shared work. Do not assume squash-merging keeps a long-lived local branch synchronized.

On conflicts, identify the files and commits. Resolve only conflicts fully inside your ownership where the right result is clear. Stop for cross-ownership conflicts and coordinate. Never resolve blindly with ours or theirs. Do not delete remote branches.

## Dependency and repository hygiene

Codex is the sole writer of shared dependency manifests and lockfiles. Inspect current packages before considering a change. Use the pinned package manager and lockfile; do not install global packages, upgrade unnecessarily, overlap libraries, or hand-merge generated lockfiles. Keep package-manager stores, caches, Corepack data, and temp files under ignored .cache/ paths inside this workspace where supported.

Keep real environment files, credentials, node_modules, build outputs, test reports, logs, local databases and dumps, generated uploads, caches, and temporary files ignored. Track only sanitized environment examples and required lockfiles. Inspect the exact diff and staged paths for secrets and generated content before every commit.

Do not start Docker, create databases, or run migrations against an external or production database without explicit approval. Verify DATABASE_URL before any database command and use only a disposable project-local database. Do not stop or delete processes, containers, or data created by another contributor.

## Engineering and verification

For authorized backend work, validate external input, enforce authorization on the server, preserve database integrity, use consistent error handling, test critical success and failure cases, avoid logging secrets, and use transactions for related financial or stock mutations when required by the confirmed specification.

Preserve integer paise and append-only ledgers as specified in docs/SPECIFICATION.md. Database append-only constraints are not cryptographic tamper evidence; never claim stronger guarantees than the implementation provides.

Do not modify unrelated code to make a check pass. Do not disable lint, tests, security checks, or CI to manufacture a pass. If a check cannot run, record NOT_RUN with the exact reason. Skipping or disabling a broken check requires explicit technical-lead approval and a recorded limitation.

## Project records

Codex maintains PROJECT_LEDGER.md, BACKEND_LEDGER.md, DECISIONS.md, DISCLOSURES.md, docs/API.md, and all AGENTS.md files. Claude maintains FRONTEND_LEDGER.md after its existing initialization.

Use PLANNED, IN_PROGRESS, BLOCKED, IMPLEMENTED, VERIFIED, and INTEGRATED precisely. VERIFIED requires actual verification. INTEGRATED requires the work to be merged and integration-tested. Record backend checkpoints with an IST timestamp, milestone, branch, scope, files, API/database changes, verification commands and outcomes, dependencies, limitations, frontend effects, commit/PR reference when available, and next action.
