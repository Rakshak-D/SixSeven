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

## D-006 — Sequence append-only labour corrections

- Context: corrections can arrive concurrently for the same attendance, payment, delivery or usage, and timestamps or UUID order do not identify the latest effective value reliably.
- Decision: serialize each correction on its original row with `FOR UPDATE` and order the immutable correction records by a database identity sequence. A trigger also rejects correction targets outside the supplied project and compensating stock movements as correction targets.
- Reason: the second concurrent correction must calculate from the first committed effective value, while the original record remains unchanged.
- Rejected alternatives: timestamps, random IDs, or updating an effective-value cache on original ledger rows.
- Trade-off: all corrections to one original record serialize; unrelated records remain concurrent.
- Impact on Claude: read contracts return original and effective values and a stable newest-first correction history without exposing internal sequence numbers.

## D-007 — Keep wage calculations in checked integer arithmetic

- Context: attendance, payments and their corrections must produce stable paise totals, including overpayment balances and reports during concurrent writes.
- Decision: calculate from a repeatable-read PostgreSQL snapshot with checked `BigInt`; reject totals outside JavaScript's safe-integer JSON range. CSV stores paise as integer values and PDF prints `INR` amounts using the same calculated response.
- Reason: avoid binary floating-point money arithmetic and inconsistent totals across JSON and exports.
- Rejected alternatives: floating-point totals, export-specific calculations, or adding an external PDF dependency.
- Trade-off: a report whose exact totals exceed the published JSON integer range returns a conflict instead of truncating.
- Impact on Claude: all report formats derive from the same worker and project totals; PDF uses an ASCII currency label for reliable rendering.

## D-008 — Bound project summaries to IST site dates and round material lines

- Context: summaries combine date-only stock, attendance and expense records, while fractional material quantities can produce fractions of a paise.
- Decision: include records from the inclusive project start date through the current IST date, bucket weekly totals by Monday in IST, and exclude future-dated records. Compute each effective original delivery's `quantity × unit price` in PostgreSQL numeric and round that line to a whole paise using PostgreSQL `round(numeric, 0)` before summing. Divide total expenditure by inclusive elapsed site days with a one-day minimum and floor the result to paise.
- Reason: retain original site dates for weekly reports and give each fractional purchase a deterministic, reconcilable monetary value.
- Rejected alternatives: JavaScript floating-point multiplication, rounding only the final aggregate, or applying corrections on their submission date.
- Trade-off: ties round away from zero per delivery line; the result can differ from rounding one aggregate.
- Impact on Claude: the additive weekly response reconciles with the project total; M5 does not expose labour breakdown to engineers.

## D-009 — Keep progress photos private with compensating filesystem cleanup

- Context: project photos must be retrievable only after membership authorization, while filesystem writes cannot join a PostgreSQL transaction.
- Decision: store validated, generated-key files under an ignored project-local directory; validate and stage images before database writes, then remove files created by a failed transaction. Return only metadata and authenticated project-scoped URLs. Document the crash window between file promotion and database commit as a possible orphan-file condition.
- Reason: avoid public/static exposure and prevent failed requests from leaving database metadata or ordinary filesystem leftovers.
- Rejected alternatives: public assets, user-controlled filenames, or claiming distributed atomicity across PostgreSQL and disk.
- Trade-off: process termination in the documented gap can leave an unreferenced file; M5 does not add automatic orphan purging.
- Impact on Claude: photo URLs require authenticated same-origin fetch; response schemas expose neither filesystem paths nor storage keys.
