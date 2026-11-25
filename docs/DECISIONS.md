# Architecture and coordination decisions

Maintained by Codex. Amend decisions only when new evidence or an approved specification changes them.

## D-001 — Retain the existing remote scaffold

- Context: The local workspace was empty and not in a Git repository. GitHub contains a same-day initial commit, scaffold PR #1, and frontend-ledger PR #2. The scaffold commit message describes a skeleton without domain code. The technical lead explicitly confirmed in this task that the scaffold was created for this hackathon and may be retained.
- Decision: Clone and build on the remote history from current main; do not initialize an unrelated root commit or replace the scaffold.
- Reason: Preserve the authorized project history and current contributors' work.
- Rejected alternatives: unrelated local git init, replacing the scaffold, or reverting main to the earlier observed d8aada reference.
- Trade-off: inherited product and route assumptions still require review against the official specification.
- Impact on Claude: frontend branch/history and existing ledger remain intact; no frontend implementation was modified.

## D-002 — Two-owner file boundaries

- Context: Existing agent files split work into four conflicting lanes and made API docs, schemas, manifests, DevOps, and routes shared or Claude-owned.
- Decision: Codex owns backend, database, server AI, shared contracts, API documentation, backend/integration tests, manifests, DevOps, and project coordination. Claude owns frontend implementation and frontend-specific tests/ledger. Mixed files use a recorded handoff.
- Reason: Keep one writer for contracts and shared infrastructure while both developers work in parallel.
- Rejected alternatives: retain four lanes or let both agents edit shared API and dependency files.
- Trade-off: frontend requests for schemas and packages pass through the ledger/issue and Codex review.
- Impact on Claude: frontend implementation paths are explicitly protected; API changes and dependency requests have a defined path.

## D-003 — Contract-first integration

- Context: Existing API docs list proposed routes, but most request/response shapes are blank and handlers are stubs.
- Decision: Treat the current route inventory as draft. Codex publishes agreed schemas, authorization, errors, and endpoint status before dependent feature work.
- Reason: Prevent frontend/backend definitions from silently diverging and avoid converting unconfirmed scaffold assumptions into requirements.
- Rejected alternatives: implement routes or UI from filenames and placeholder role tables.
- Trade-off: business-feature implementation waits for the official specification.
- Impact on Claude: contract-derived mocks can proceed only after an agreed contract and must remain visibly marked as mocked.

## D-004 — Merge-commit synchronization

- Context: main already uses merge commits for scaffold PR #1 and frontend-ledger PR #2.
- Decision: Preserve that strategy for PR integration and merge main into active shared branches when synchronizing. Do not squash long-lived work, rebase shared branches, or force-push.
- Reason: Keep ancestry explicit and provide a safe synchronization path.
- Rejected alternatives: squash-merging long-lived branches or rewriting shared history.
- Trade-off: merge commits add visible history.
- Impact on Claude: frontend branches remain mergeable with the same synchronization procedure.

## D-005 — Keep local persistent data inside the workspace

- Context: Existing compose configuration used Docker-managed persistent volumes, while this task restricts external persistent database storage and requires local caches/artifacts to stay ignored.
- Decision: Compose database and upload paths bind to ignored .cache/postgres and .cache/uploads; package-manager data and temporary files are directed to ignored .cache paths.
- Reason: Keep project data under the authorized workspace.
- Rejected alternatives: leave persistent project data in Docker-managed named volumes or install package tools globally.
- Trade-off: local DB data is tied to the checkout and is not shared; Docker Engine image/container state remains outside the repository.
- Impact on Claude: shared local-development instructions now describe workspace-local data paths; no Docker process or database was started by M0.
