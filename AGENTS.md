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

AGENTS.md is the canonical instruction source. Root and nested CLAUDE.md files must continue to import or reference the AGENTS.md beside them using the repository's existing @AGENTS.md mechanism. Both collaborators may maintain these instructions. Keep CLAUDE.md as a thin import of AGENTS.md.

Before editing a directory, read its AGENTS.md and the root PROJECT_LEDGER.md, BACKEND_LEDGER.md, FRONTEND_LEDGER.md, DECISIONS.md, and docs/API.md as relevant. An instruction file does not prove the feature it describes exists.

## Full-stack collaboration

Codex and Claude are peer full-stack collaborators. Either may edit frontend, backend, database, shared contracts, infrastructure, tests and documentation within a human-authorized task. Preserve concurrent work, keep branches scoped and review breaking contract changes with their consumers. Human developers retain final authority.

## Contract-first parallel work

The shared Zod schemas in src/shared/** and docs/API.md are the single API contract. The implementing collaborator defines method, path, authentication, authorization, request and response schemas, and errors before feature implementation. Keep frontend-safe schemas free of database drivers, server-only modules, secrets, and runtime-only imports.

Use only development fixtures derived from the agreed shared contract. Mark mock data clearly in the UI and in FRONTEND_LEDGER.md; never return a fake success that looks live. Keep contract availability, backend readiness, and frontend integration as separate statuses. Breaking contract changes require coordination and a contract-only integration step before dependent work is merged.

## Material verification and supplier payments

Use docs/SPECIFICATION.md and docs/API.md for current behavior. Contractors cannot manage supplier payments or bank details. Owners can grant and revoke one engineer's bounded mock-payment authority. A server-side payment decision still requires a verified delivery, approved supplier and order, and applicable limits. Persist each decision and grant change in the audit log. Keep bank changes behind owner approval and the server cooldown. Label payments as simulations. Scans and photo evidence support accountability and cannot establish physical authenticity.

## Branches and integration

Use:
- main for the stable integrated application
- chore/coordination for repository workflow and coordination
- db/<topic> for database work
- be/<topic> for backend features
- ai/<topic> for AI integrations
- ops/<topic> for infrastructure
- fe/<topic> for frontend work

Before each implementation task:
1. Verify the branch and clean working-tree status.
2. Fetch remote changes and confirm the exact main base.
3. Read the latest API contract and both relevant ledgers.
4. Check whether main or an active branch changed the intended files.
5. Confirm every planned file belongs to the authorized task.

Create feature branches from the latest verified main. Never commit or push directly to main. Use pull requests and merge commits so active branch ancestry remains synchronizable. When an active branch needs main, merge main into it with a merge commit; do not rebase or force-push shared work. Do not assume squash-merging keeps a long-lived local branch synchronized.

On conflicts, identify the files and commits. Resolve conflicts semantically when the correct result is clear. Coordinate when intent is uncertain. Never resolve blindly with ours or theirs. Do not delete remote branches.

## Dependency and repository hygiene

Keep changes to manifests and lockfiles scoped and coordinated. Inspect current packages before considering a change. Use the pinned package manager and lockfile; do not install global packages, upgrade unnecessarily, overlap libraries, or hand-merge generated lockfiles. Keep package-manager stores, caches, Corepack data, and temp files under ignored .cache/ paths inside this workspace where supported.

Keep real environment files, credentials, node_modules, build outputs, test reports, logs, local databases and dumps, generated uploads, caches, and temporary files ignored. Track only sanitized environment examples and required lockfiles. Inspect the exact diff and staged paths for secrets and generated content before every commit.

Do not start Docker, create databases, or run migrations against an external or production database without explicit approval. Verify DATABASE_URL before any database command and use only a disposable project-local database. Do not stop or delete processes, containers, or data created by another contributor.

## Engineering and verification

For authorized backend work, validate external input, enforce authorization on the server, preserve database integrity, use consistent error handling, test critical success and failure cases, avoid logging secrets, and use transactions for related financial or stock mutations when required by the confirmed specification.

Preserve integer paise and append-only ledgers as specified in docs/SPECIFICATION.md. Database append-only constraints are not cryptographic tamper evidence; never claim stronger guarantees than the implementation provides.

Do not modify unrelated code to make a check pass. Do not disable lint, tests, security checks, or CI to manufacture a pass. If a check cannot run, record NOT_RUN with the exact reason. Skipping or disabling a broken check requires explicit technical-lead approval and a recorded limitation.

## Project records

Either collaborator may update project records for an authorized task.

Use PLANNED, IN_PROGRESS, BLOCKED, IMPLEMENTED, VERIFIED, and INTEGRATED precisely. VERIFIED requires actual verification. INTEGRATED requires the work to be merged and integration-tested. Record backend checkpoints with an IST timestamp, milestone, branch, scope, files, API/database changes, verification commands and outcomes, dependencies, limitations, frontend effects, commit/PR reference when available, and next action.
