# Backend Ledger

Exclusive write ownership: Codex. Newest checkpoint first. Timestamp is IST.

## Entry — Integrated backend status

- 2026-11-26 IST. Supplier and steel work merged in #45 and #46. Disposable PostgreSQL passed a fresh install and an upgrade from migration 0013. The upgrade retained the verified delivery, added one pending mock bill and recorded no payment.
- The combined suite passed all 170 tests with the local 25-second test timeout. Typecheck and Biome passed. The hosted checks for the two pull requests passed.
- #29, #41 and #42 remain draft PRs while their frontend consumers and fixtures are updated. The wage and capture drafts each independently use migration 0016. The later one must be regenerated after the earlier one is merged.

## Entry — Engineer steel-marking hold point

- Request #15, 2026-11-26 IST, branch `be/steel-hold-point`. Flagged checklist items require project engineer evidence for the current contractor submission before acceptance. The API stores capture and receipt times and retains prior evidence.
- PostgreSQL fresh migration and seed passed. All 9 project reporting API tests passed, including no-evidence rejection, role denial, cross-project privacy and original photo byte retrieval. Typecheck passed.
- Frontend handoff: `src/hooks/use-project-data.ts` and `src/components/engineer/review-list.tsx` can use the new multipart evidence endpoint before acceptance. Checklist creation and approved additions accept `requiresSteelProof`.

## Entry — Approved suppliers, mock payments and owner flags

- Requests #16–19 and #25, 2026-11-26 IST, branch `be/supplier-mock-payments`, migration `0014_supplier_mock_payments`. Added owner-only supplier, bank-change, order, mandate, approval and payment reads. Verified deliveries enter the mock queue transactionally. Release consumes approved capacity and enforces applicable mandate caps. The owner summary exposes deterministic review flags.
- No external gateway or real payment data is used. Bank account values are reduced to their last four digits before storage. Only project owners can manage or read these operations. Delegation is outside the owner-only approval policy.
- Fresh migration, seed, upgrade, Biome, typecheck and all 23 focused stock and supplier tests passed. The concurrent supplier test first exposed a database lock conflict. A project lock compatible with foreign-key checks preserves serialization and resolved it.
- Frontend handoff: use `src/shared/schemas/supplier-payments.ts` from `src/hooks/use-supplier-payments.ts` and replace the strict frontend mock-only response readers in `src/lib/supplier-payments.ts` before enabling live supplier data. Supplier edits return a mock receipt; refresh the overview for updated state. Mandate updates require `paused`. The verification queue does not disclose prices.

## Entry — Delivery and material identity verification (#13–14)

- Branch `be/bag-verification`, migration `0013_bag_verification`. Added the engineer queue, verification routes, project-unique codes and transactional usage consumption. Existing materials remain quantity-based unless tracking is set on creation. Tracked and verified quantity corrections require a separate reconciliation mechanism.
- Fresh PostgreSQL migration, seed, baseline upgrade test, Biome, typecheck and all 164 local tests passed. The tests cover registration conflicts, unauthorized access, cross-material rejection and concurrent consumption.
- Frontend handoff: switch `src/hooks/use-supplier-payments.ts` to `DeliveryVerificationQueue` and `DeliveryVerificationResponse`, send codes from `src/components/payments/verify-deliveries.tsx` for tracked materials, and collect them in the usage form. The verification queue omits prices. Supplier payment release is a separate backend change.

## Entry — Medical claims and bill photo contract

- Branch `be/medical-evidence`, requests #23 and #27. Medical bill submissions use one `capturedAt` part per `billPhotos` part in matching order. This confirms the frontend ledger's multipart convention. The author and authorized reviewers can fetch private bill images.
- Migration `0012_medical_evidence` stores the claim and capture/receipt metadata. Approval inserts one mock expense in the owner decision transaction. Rejection and duplicate acceptance do not create another expense.
- Local verification passed fresh migration, demo seed, and 13 PostgreSQL reporting and database tests. The medical test covers stale captures, cross-project access, private image bytes, amount bounds, concurrent approval and weekly reconciliation. This entry covers medical photos. Other upload routes have a separate rollout.

## Entry — Request #4 engineer-led project setup

- Timestamp: 2026-11-26 IST. Branch: `be/project-invitations`.
- New project creators receive engineer membership. The engineer issues owner and contractor invitations with `POST /api/v1/projects/:id/invitations`. Signed-in users list and accept their own pending invitations through `GET /api/v1/invitations` and `POST /api/v1/invitations/:id/accept`. Acceptance and membership are atomic. Legacy contractor-created projects retain direct enrollment.
- Migration `0007_project_invitations` adds the project/email uniqueness rule and acceptance metadata. Invitations are in-app records; receiving one does not provision an account or send email.
- PostgreSQL migration, seed and the auth/projects and database suites passed, 16 tests. Tests include duplicate issuance and acceptance under concurrency, recipient isolation and role enforcement.
- Frontend handoff: use the creator role from the create response. Add invitation list/accept to `src/app/projects/page.tsx` or its project-list component, and use the invitation endpoint for engineer enrollment instead of the contractor-only direct enrollment action in `src/components/shell/action-sheet.tsx`. Regenerate the unmerged migration after any earlier schema PR lands.

## Entry — Request #6 expected deliveries and challan evidence

- Timestamp: 2026-11-26 IST. Branch: `be/delivery-logistics`.
- Added project scheduling and history, contractor acceptance through the existing stock transaction, rejection with reason and optional replacement date, and activity entries. Added protected single-photo attachment and retrieval for recorded deliveries. Both reuse the project's existing authorization; attachment storage reuses progress image validation and private file storage.
- Migration `0007_delivery_logistics` adds schedules, evidence metadata and cross-project foreign keys. Regenerate the unmerged migration when an earlier schema PR lands.
- Verification: isolated PostgreSQL 16 fresh migration and seed, scoped Biome, typecheck and all 132 Vitest tests passed. Checks cover concurrent acceptance, stock invariants, role and project access, rejected arrival history, image content and bytes, duplicate attachment cleanup and append-only triggers.
- Frontend handoff: connect schedule queries and actions in `src/hooks/use-project-data.ts` and `src/components/today/today-page.tsx`. After recording a delivery, upload the selected photo as FormData field `photo` using the returned delivery ID. Report a photo failure separately from a successfully recorded delivery. The optional activity label for `expectedDelivery` belongs in `src/lib/activity.ts`.
- Requests #13–19 remain planned. Current stock, approvals, checklists and evidence validate application records. There are no per-bag scan or use gates, steel hold-point enforcement, supplier bank workflow, pre-approved order rules, simulated payment release or fraud scorecards in this batch. Keep those contracts separate from real money movement and avoid claims of physical authenticity.

## Entry — Request #12 project team contacts

- Timestamp: 2026-11-26 IST. Branch: `be/team-contacts`.
- Added member-scoped `GET /api/v1/projects/:id/members` and caller-only `PATCH /api/v1/me`. The latter sets or clears an Indian mobile number. Only the caller and project teammates can receive it. Auth responses still omit it.
- Migration `0008_team_contacts` adds a nullable phone column and was regenerated after worker lifecycle `0007` merged.
- Fresh PostgreSQL migration and seed, typecheck, scoped Biome, and the auth/projects and database suites passed (16 tests). The full lint job on main requires the frontend formatting handoff recorded in the live integration PR.
- Frontend handoff: connect the Team panel query through `src/hooks/use-project-data.ts` with `ProjectTeamResponse`. Use `UpdateMyPhoneInput` for profile submission, and omit the call action if phone is absent.

## Entry — Request #5 worker deactivation

- Timestamp: 2026-11-26 IST. Branch: `be/worker-lifecycle`.
- Contractor-only `POST /api/v1/projects/:id/workers/:workerId/deactivate`. Migration `0007_worker_lifecycle` stores the reason and timestamp. Worker lists return optional `removedReason` and `removedOn`. Existing inactive records may lack that metadata.
- Worker and attendance writes serialize on the same row. The update and audit entry commit together. Existing wages and attendance remain available.
- Verification: isolated PostgreSQL upgrade and focused labour/database suite passed, 17 tests. Covers concurrent deactivation, denied writes, post-deactivation attendance rejection, historical rate preservation and a single audit event.
- Frontend handoff: add a worker deactivation action using `DeactivateWorkerInput` and invalidate the `[id, "workers"]` query in `src/hooks/use-project-data.ts`. Render optional removal metadata in the team UI when implemented. No frontend files changed.

## Entry — Live integration restart

- Timestamp: 2026-11-26 IST. Branch: `be/live-integration`, based on main `4bfc586`.
- Recovered verified checklist type exports from the stopped recovery worktree. Its frontend changes and audit artifacts remain in that worktree. This batch carries no frontend implementation or migration changes.
- Requests #7 and #8 already have server implementations. The checklist read now has accurate documentation and an OpenAPI regression for the verified response. Request #10 already has a PostgreSQL regression for weekly reconciliation and the engineer-safe projection.
- The Better Auth bridge accepts the empty stream Next supplies for a bodyless logout. A regression reproduces that request shape. On the Windows launcher with isolated PostgreSQL 16, all three demo accounts passed sign-in, HttpOnly cookie, session lookup, scoped project discovery, logout and old-cookie denial over HTTP.
- `start.sh --live` provides local Compose startup for Linux/macOS and shares the database identity and migration history check with Windows. Bash and Node syntax checks passed locally. Ubuntu startup is covered by a new CI job. Native macOS startup has not been exercised.
- Frozen installation, Biome and typecheck passed. The first local backend run passed 129 tests and timed out in the baseline upgrade migration at five seconds. A rerun with a 20-second Docker Desktop test deadline passed all 130 tests across 17 files. The hosted Ubuntu launcher also passed.
- Frontend CI handoff: run Biome formatting and import organization for `src/app/(auth)/sign-in/page.tsx`, and Biome formatting for `src/components/shell/ai-assistant-widget.tsx`. These main-branch errors stop the full CI job before PostgreSQL tests.
- Next: engineer-safe attendance and worker lifecycle contracts, followed by project invitations, delivery scheduling and attachments, wage mode validation and team contacts. No frontend edit is required for the auth or checklist compatibility fixes.

## Entry — Request #11 engineer attendance roster

- Timestamp: 2026-11-26 IST. Branch: `be/attendance-roster`.
- New `GET /api/v1/projects/:id/attendance/roster` returns a project member's dated attendance view with the latest effective half-day units. Its query and serializer omit wage rates, totals and adjustment details. Existing financial routes and permissions remain in force. No migration or new dependencies.
- PostgreSQL verification: `vitest run tests/api/labour-accounting.test.ts --testTimeout 20000`, 12 passed. Covers engineer output after an attendance correction, missing sessions, cross-project denial and continued 403 on the financial route.
- Frontend handoff: update the engineer Logs query in `src/hooks/use-project-data.ts` and its consumer under `src/components/logs/` to request the roster and parse `AttendanceRosterResponse`. Render the worker name and effective half-day units. Continue using the existing financial read for owner and contractor Logs.

## Entry — M6 proposals and checklist verification

- Timestamp: 2026-11-25 21:04:30+05:30
- Branch: be/m6-workflows
- Scope: project-scoped proposal decisions, deterministic checklist drafts, contractor photo evidence, engineer review and append-only checklist history.
- API and database: contract PR #19 integrates request #7 and #8. Migration 0006 adds proposal, draft, checklist, item and event tables and project-scoped links to progress evidence. Seed adds deterministic proposal and checklist records.
- Verification: local Biome, typecheck, 32 focused tests and production build passed. The initial implementation head passed PostgreSQL migrations, repeatable seed and the full API suite in [PR #20 CI](https://github.com/Rakshak-D/SixSeven/actions/runs/45646443031).
- Frontend: retain legacy display status, use verificationStatus for workflow and supply progressId during review. Live PATCH renames only.
- Limitations: checklist generation uses a deterministic template. Expenses and payments are unaffected by proposals. Demo checkout and database remain at their original baseline.
- Next action: verify the final PR head before integration.

## Entry — M5 integrated and main CI verified

- Timestamp: 2026-11-25 20:38:37+05:30
- Milestone/task ID: M5 integration closure
- Branch: `chore/m5-integration-record`
- Scope: record the completed M5 merge and verification of the merged main tree.
- Files affected: API, backend and project ledgers only.
- API or database changes: none.
- Verification commands and outcomes: PR #14 CI run #49 passed Biome, typecheck, PostgreSQL 16 migration, repeatable demo seed, and all 102 tests across 14 files at `a721c52e2d971f184bbe976d289b2dc5ee543bdb`. Main CI run #50 passed the same checks on merge commit `1a81e780fbba7a47012f928a0b86b1f64d56770e`. Local main was fast-forwarded to that merge commit and has a clean working tree.
- Dependencies added: none.
- Known limitations: filesystem and PostgreSQL writes are not distributed-atomic; process termination between file promotion and metadata commit can leave an orphan. Checklist references remain unavailable until M6. No local PostgreSQL service was started; database checks used disposable hosted PostgreSQL 16.
- Frontend implications: no frontend implementation or frontend ledger changes. M5 code diff contains no frontend-owned implementation files.
- Commit or PR reference: [PR #14](https://github.com/Rakshak-D/SixSeven/pull/14) merged as `1a81e780fbba7a47012f928a0b86b1f64d56770e`; [PR CI #49](https://github.com/Rakshak-D/SixSeven/actions/runs/45641035558); [main CI #50](https://github.com/Rakshak-D/SixSeven/actions/runs/45641473492).
- Next action: await the next authorized milestone.

## Entry — M5 reporting and progress verified before integration

- Timestamp: 2026-11-25 20:32:51+05:30
- Milestone/task ID: M5
- Branch: `be/project-reporting`
- Scope: project summary and weekly expenditure, secure progress-photo upload/retrieval, timeline grouping, and role-filtered project activity.
- Files affected: API routes and services; shared wage calculation helper; reporting/progress/photo schema and migrations 0004–0005; synthetic seed and snapshot; PostgreSQL integration tests; CI and upload configuration; API, project, decision, disclosure and DevOps documentation.
- API or database changes: implemented `GET /projects/:id/summary`, `POST /projects/:id/progress`, `GET /projects/:id/timeline`, `GET /projects/:id/photos/:photoId`, and `GET /projects/:id/activity`. Added expense, progress and photo persistence with append-only guards. Expenses contribute to reporting, but there is no expense write workflow; non-null checklist references remain rejected until M6.
- Verification commands and outcomes: local `corepack pnpm --store-dir .cache/pnpm-store run lint`, `run typecheck`, focused Vitest (5 files / 40 tests), `exec drizzle-kit check`, production `run build`, and `git diff --check` passed. Hosted PostgreSQL CI #48 passed on exact PR head `53f4720e1332a67a7faee3b6bbac754d4be46bbd`: Biome, typecheck, migration, demo seed twice, and all 102 tests across 14 files.
- Dependencies added: Sharp `0.35.5` for bounded image decoding and synthetic PNG fixtures.
- Known limitations: PostgreSQL and filesystem writes are not distributed-atomic; request failures clean created files, while process termination after file promotion and before transaction commit can leave an orphan. No isolated local PostgreSQL was started; full database verification ran in hosted disposable PostgreSQL 16 CI.
- Frontend implications: weekly summary contract is available from merged PR #13. Engineers receive aggregate summary and weekly spend only. No frontend implementation or frontend ledger files changed. Requests #4–9 and #11 remain open for product review.
- Commit or PR reference: [PR #14](https://github.com/Rakshak-D/SixSeven/pull/14), head `53f4720e1332a67a7faee3b6bbac754d4be46bbd`; [PostgreSQL CI #48](https://github.com/Rakshak-D/SixSeven/actions/runs/45639908173) passed.
- Next action: publish this verified checkpoint, rerun CI for the resulting head, then merge PR #14 and verify main CI.

## Entry — M5 reporting and progress implementation in progress

- Timestamp: 2026-11-25 19:37:18+05:30
- Milestone/task ID: M5
- Branch: `be/project-reporting`
- Scope: persisted summary inputs, weekly financial reporting, private progress-photo storage, timeline and role-filtered project activity.
- Files affected: summary/activity/progress services and routes; shared M4 wage helper; expense/progress/photo schema and migrations 0004–0005; synthetic seed and seed snapshot; PostgreSQL reporting tests; upload environment and CI configuration; API, project and decision records; Sharp dependency and disclosures.
- API or database changes: implemented handlers for `GET /projects/:id/summary`, `POST /projects/:id/progress`, `GET /projects/:id/timeline`, `GET /projects/:id/photos/:photoId` and `GET /projects/:id/activity`. Added expense/progress/photo persistence with append-only guards. No expense write endpoint or checklist runtime was added.
- Verification commands and outcomes: `corepack pnpm --store-dir .cache/pnpm-store run lint` passed (90 files); `typecheck` passed; focused Vitest passed (5 files, 40 tests); `exec drizzle-kit check` passed; `run build` passed; `git diff --check` passed. The PostgreSQL-backed reporting tests have not run locally because no disposable local PostgreSQL instance is authorized; exact-head hosted CI remains required.
- Dependencies added: Sharp `0.35.5` for bounded image decoding and synthetic PNG fixtures.
- Known limitations: database/filesystem writes are not distributed-atomic; request failures clean created files, while process termination in the documented promotion/commit gap can leave an orphan. Checklist references remain rejected until M6. Hosted PostgreSQL verification and PR publication remain.
- Frontend implications: weekly contract is available from merged PR #13. M5 response shapes remain additive; engineers receive only aggregate weekly and summary spending fields. No frontend files or frontend ledger were changed. Requests #4–9 and #11 remain open for product review.
- Commit or PR reference: weekly contract [PR #13](https://github.com/Rakshak-D/SixSeven/pull/13) merged as `c56504f7004a256c7704a51e89c6b4b7402f083b`; M5 implementation PR pending.
- Next action: stage and review the complete M5 diff, publish `be/project-reporting`, and verify hosted PostgreSQL CI before merge.

## Entry — M4 integrated and main CI verified

- Timestamp: 2026-11-25 17:45:43+05:30
- Milestone/task ID: M4 integration closure
- Branch: chore/m4-integration-record
- Scope: record the completed M4 merge and main CI verification.
- Files affected: API, project and backend ledgers only.
- API or database changes: none.
- Verification commands and outcomes: PR #11 CI run #29 passed Biome, typecheck, PostgreSQL 16 migration, migration upgrade, two-run seed verification, and all 81 tests. Main CI run #30 passed the same workflow on merge commit `c34eb6e4077f1eeb38ef3312b55df3011007d416`. `git diff --check` will be run before this documentation commit.
- Dependencies added: none.
- Known limitations: PostgreSQL verification ran in hosted disposable CI; no local PostgreSQL service was started.
- Frontend implications: no frontend implementation or frontend ledger changes.
- Commit or PR reference: [PR #11](https://github.com/Rakshak-D/SixSeven/pull/11), merge `c34eb6e4077f1eeb38ef3312b55df3011007d416`, [PR CI #29](https://github.com/Rakshak-D/SixSeven/actions/runs/45611095977), [main CI #30](https://github.com/Rakshak-D/SixSeven/actions/runs/45611840467).
- Next action: begin the next specification-authorized M5 scope for owner budget summary, progress/photo storage and project activity visibility.

## Entry — M4 PostgreSQL CI correction and verification

- Timestamp: 2026-11-25 17:35:58+05:30
- Milestone/task ID: M4 verification follow-up
- Branch: be/labour-accounting
- Scope: fix defects exposed by the first PostgreSQL-backed PR run and tighten effective-history verification.
- Files affected: labour list services, correction history ordering, PostgreSQL integration tests, and API documentation.
- API or database changes: attendance and wage-payment history now read originals and their effective corrections within repeatable-read, read-only transactions. Payment paise are parsed to safe JSON numbers. Adjustment history orders by the identity sequence used for effective correction selection.
- Verification commands and outcomes: PR #11 CI run #27 passed Biome, typecheck, migration 0003, migration-upgrade, and two-run seed idempotence; Vitest reported 77 passed and 4 failed. The failures exposed string-valued effective paise, the attendance effective-value read, a reversed newest-first assertion, and PDF text searched in raw encoded bytes. After fixes, local Biome, typecheck, 33 shared/OpenAPI/export tests, and production build passed. PR #11 CI run #28 passed all steps, including PostgreSQL migration, migration-upgrade, twice-seeded fixture comparison, and 81 tests across 10 files.
- Dependencies added: none.
- Known limitations: post-merge main CI remains to be verified. The CI PostgreSQL 16 service was disposable; no local database was started.
- Frontend implications: no frontend implementation or frontend ledger changes; response shapes remain the published contracts.
- Commit or PR reference: [PR #11](https://github.com/Rakshak-D/SixSeven/pull/11), current reviewed head `b324994428648d33a430c56cb1790cb9a7815f15`; CI run #28 passed.
- Next action: verify the exact PR head and diff, merge with the established merge-commit strategy, then verify main CI.

## Entry — M4 labour accounting implementation

- Timestamp: 2026-11-25 17:04:10+05:30
- Milestone/task ID: M4
- Branch: be/labour-accounting
- Scope: attendance and wage-payment records, effective correction history, exact wage sheets in JSON/CSV/PDF, and synthetic idempotent labour fixtures.
- Files affected: new Drizzle migration and labour tables; attendance, payment, correction and wage-report services/routes; stock-ledger exact signed-milli support; API/database tests; seed snapshot; API, project and decision documentation.
- API or database changes: migration 0003 adds attendance, wage_payments and adjustments, project-scoped worker FKs, value constraints, indexed identity ordering, target validation, and append-only update/delete/truncate guards. Added the three read endpoints and wage-sheet JSON/CSV/PDF implementation using existing contracts.
- Verification commands and outcomes: `corepack pnpm exec biome check --line-ending=crlf --javascript-formatter-line-ending=crlf --json-formatter-line-ending=crlf <M4 files>` — PASS; `corepack pnpm typecheck` — PASS; `corepack pnpm exec vitest run tests/api/labour-openapi.test.ts src/shared` — PASS, 31 tests in 4 files; `corepack pnpm build` — PASS. The focused OpenAPI test first failed on missing routes and passed after registration. PostgreSQL migration, integration tests and full CI are pending; no local PostgreSQL service was started.
- Dependencies added: none.
- Known limitations: real PostgreSQL behavior, migration upgrade, concurrent requests, audit rollback, repeated seed and the full suite remain unverified until hosted PostgreSQL CI completes.
- Frontend implications: no frontend implementation, API client or frontend ledger changed. Existing merged shared contracts are implemented by the new backend handlers; engineer access to worker-level labour reports is denied.
- Commit or PR reference: pending.
- Next action: review the exact diff, commit and push the implementation, open its PR, and use PostgreSQL CI to resolve any migration or integration failures before merge.

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
