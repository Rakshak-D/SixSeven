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

AGENTS.md is the canonical instruction source. Root and nested CLAUDE.md files import the AGENTS.md beside them with @AGENTS.md; keep that mechanism. Edit AGENTS.md, not CLAUDE.md.

Before editing a directory, read its AGENTS.md and docs/API.md as relevant. An instruction file does not prove the feature it describes exists.

## Ownership

Claude owns the whole repository: frontend, backend, database, shared contract, tests, configuration and records (set by Max, 2026-11-26). The earlier Codex/Claude lane split, its handoffs and its ledger gates no longer apply. Some nested AGENTS.md files still describe the old lanes; this section overrides them.

## Contract-first API

The shared Zod schemas in src/shared/** and docs/API.md are the single API contract. Define method, path, authentication, authorization, request and response schemas, and errors there before building on them, and use those schemas on both sides; never define competing frontend-only shapes. Keep frontend-safe schemas free of database drivers, server-only modules, secrets, and runtime-only imports.

Mark mock data clearly in the UI and never return a fake success that looks live. The live app runs with NEXT_PUBLIC_USE_MOCKS=0.

## Planned feature: anti-fraud and payments

Status: PLANNED. The frontend developer approved this direction on 2026-11-25 in the team doc "SixSeven: Anti-Fraud and Payments Plan". It is not yet in docs/SPECIFICATION.md or docs/API.md, and no milestone is assigned. Before any implementation, fold it into the specification, the shared contract and a milestone. Requests 13 to 19 in docs/FRONTEND_LEDGER.md carry the details.

The problem it answers: a contractor buys genuine material, shows the owner the real bill, resells the stock and builds with cheaper material. The fix checks material again at the moment of use and keeps the contractor out of the money flow. Once authorized, these rules hold:

- The contractor never starts or approves a supplier payment and never sees supplier bank details. Today the specification lets contractors record payments; changing that rule needs technical-lead approval in the specification.
- A payment is released only for a delivery the engineer verified by scanning each bag's code, to an owner-approved supplier, for an amount the server calculates and caps at the owner's pre-approved order.
- A usage entry saves only if every scanned bag code belongs to a delivery of that material in the same project and has not been used before.
- A slab cannot be marked ready to pour until the engineer uploads photos of the steel markings (brand, BIS mark, MTC number).
- A change to a supplier's bank details needs owner approval, waits through a 24 to 48 hour cooldown and alerts the owner.
- Slate never holds money. The hackathon build uses a mock payment that the UI labels and that README.md and DISCLOSURES.md disclose. A real build would use a licensed gateway (escrow or a UPI mandate) after a legal check.
- Never claim fraud is impossible. Collusion between the contractor and the engineer is made visible through flags and the audit trail; it is not prevented.

## Branches and integration

Use:
- main for the stable integrated application
- chore/coordination for repository workflow and coordination
- db/<topic> for database work
- be/<topic> for backend features
- ai/<topic> for AI integrations
- ops/<topic> for infrastructure
- fe/<topic> for frontend work
- fix/<topic> for fixes across the stack

Before each implementation task:
1. Verify the branch and clean working-tree status.
2. Fetch remote changes and confirm the exact main base.
3. Read the latest API contract.
4. Check whether main or an active branch changed the intended files.

Create feature branches from the latest verified main. Never commit or push directly to main. Use pull requests and merge commits so active branch ancestry remains synchronizable. When an active branch needs main, merge main into it with a merge commit; do not rebase or force-push shared work. Do not assume squash-merging keeps a long-lived local branch synchronized.

On conflicts, identify the files and commits. Resolve conflicts only where the right result is clear; otherwise stop and ask Max. Never resolve blindly with ours or theirs. Do not delete remote branches.

## Dependency and repository hygiene

Inspect current packages before considering a change. Use the pinned package manager and lockfile; do not install global packages, upgrade unnecessarily, overlap libraries, or hand-merge generated lockfiles. Keep package-manager stores, caches, Corepack data, and temp files under ignored .cache/ paths inside this workspace where supported.

Keep real environment files, credentials, node_modules, build outputs, test reports, logs, local databases and dumps, generated uploads, caches, and temporary files ignored. Track only sanitized environment examples and required lockfiles. Inspect the exact diff and staged paths for secrets and generated content before every commit.

Do not start Docker, create databases, or run migrations against an external or production database without explicit approval. Verify DATABASE_URL before any database command and use only a disposable project-local database. Do not stop or delete processes, containers, or data created by another contributor.

## Engineering and verification

For authorized backend work, validate external input, enforce authorization on the server, preserve database integrity, use consistent error handling, test critical success and failure cases, avoid logging secrets, and use transactions for related financial or stock mutations when required by the confirmed specification.

Preserve integer paise and append-only ledgers as specified in docs/SPECIFICATION.md. Database append-only constraints are not cryptographic tamper evidence; never claim stronger guarantees than the implementation provides.

Do not modify unrelated code to make a check pass. Do not disable lint, tests, security checks, or CI to manufacture a pass. If a check cannot run, record NOT_RUN with the exact reason. Skipping or disabling a broken check requires explicit technical-lead approval and a recorded limitation.

## Project records

The records live in docs/: PROJECT_LEDGER.md, BACKEND_LEDGER.md, FRONTEND_LEDGER.md, DECISIONS.md, DISCLOSURES.md, DEMO.md and API.md. Keep entries short.

Use PLANNED, IN_PROGRESS, BLOCKED, IMPLEMENTED, VERIFIED, and INTEGRATED precisely. VERIFIED requires actual verification. INTEGRATED requires the work to be merged and integration-tested. Record backend checkpoints with an IST timestamp, milestone, branch, scope, files, API/database changes, verification commands and outcomes, dependencies, limitations, frontend effects, commit/PR reference when available, and next action.
