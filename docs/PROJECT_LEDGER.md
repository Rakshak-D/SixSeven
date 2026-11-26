# Project Ledger — Slate / SixSeven

## Final release integration authorization

The technical lead authorized scoped frontend, backend and end-to-end verification changes for final integration. Preserve the existing visual design and teammate work. Normal ownership resumes outside this release task.


Maintained by Codex. This is the coordination source of truth; Claude records frontend work only in FRONTEND_LEDGER.md.

## Identity and specification

- Project: Slate
- Team: SixSeven
- Repository: https://github.com/Rakshak-D/SixSeven
- Product baseline: [SPECIFICATION.md](SPECIFICATION.md), recovered from the approved repository history.
- Event constraints: the task brief confirms a 24-hour hackathon. Start time, exact deadline, judging schedule, and remaining time are not confirmed. Time cues in older scaffold notes are unverified and are not project constraints.

## Current architecture reference

The repository currently contains one Next.js App Router app, Hono at /api/v1, Drizzle/PostgreSQL, Better Auth dependencies, shared Zod files, and generated OpenAPI wiring. This is the approved topology. Do not create a separate backend application.

## Milestones and dependencies

| Milestone | State | Dependency / exit condition |
|---|---|---|
| M0 — repository foundation and ownership | INTEGRATED | Approved PR #3 merged. The merged tree matches the reviewed tree, and local post-merge unit tests and typecheck passed. |
| M1 — shared API contracts | INTEGRATED | PR #6 merged and main CI #14 passed. |
| M2 — auth and project access | INTEGRATED | PR #7 merged and main CI #18 passed all 45 tests. |
| M3 — material, worker and stock operations | VERIFIED | PR #8 PostgreSQL CI passed all 64 tests, including concurrent ledger writes and repeated demo seeding. |
| M4 — attendance, wage accounting and corrections | INTEGRATED | PR #11 merged as `c34eb6e`; PR CI #29 passed all 81 tests and main CI #30 passed on the merge commit. |
| M5 — financial summary, progress evidence and activity | INTEGRATED | PR #14 merged as `1a81e78`; PR CI #49 and main CI #50 passed migration, seed twice, Biome, typecheck and all 102 PostgreSQL-backed tests. |
| M6 — proposals and engineer verification | VERIFIED | Contract PR #19 merged. Implementation PR #20 passed hosted PostgreSQL CI. |
| Demo readiness | PLANNED | Requires implemented paths plus isolated test data and an exercised journey. |

## Priorities

- P0: complete attendance and project-scoped operational records.
- P1: labour accounting, corrections, financial reporting, progress and audit operations.
- P2: proposals and reviewed checklist drafts.

## Status snapshot

- Overall: M5 is integrated and verified on main. It adds append-only expense/progress/photo persistence and implements summary, weekly spend, progress upload, timeline, protected photo retrieval and activity endpoints.
- Frontend: FRONTEND_LEDGER.md already has Claude's initialization and backend requests; Codex leaves it unchanged.

## Integration checkpoints

1. Technical lead approved the repository baseline. See SPECIFICATION.md.
2. Integrate M1 shared schemas and docs/API.md before dependent implementation.
3. Codex implements backend routes and data rules with backend tests.
4. Claude implements frontend pages using the agreed contract and clearly marked contract-derived mocks.
5. Integrate active work with merge commits and exercise the approved end-to-end journey before marking INTEGRATED.

## Blockers

- Event start/end time and confirmed schedule not supplied.
- GitHub reports main as unprotected. Repository rulesets were empty at M0 inspection; do not change settings without approval. Enforce PR-only behavior in agent instructions.
- No project-local database was started or verified in M0.

## Risks

- The repository is public; all committed content is public.
- Published schemas still require live handlers and integration verification.
- External Claude artifact links in the inherited instructions were not read or verified in this work.
- Branch protection is absent, so contributors must honor the PR-only process.
- The frontend ledger records that a prior scaffold session started local services and used paths outside the project; this M0 run did not verify or alter that prior environment state.

## Git baseline and publication

- Previously observed reference main: d8aadaabe53233a724b421693ac6cdbb9f1f326d (historical reference only).
- Verified M0 merge on main: ac00d971e80b42508a3a85c9b184a1b70b47b0bf.
- M0 branch: chore/coordination, created from pre-M0 main 29b06094031f1fab470aa3c648c2ff2734af7e73.
- M0 foundation commit: 7941f25fe38365cb851732ffd1c0996d6c3f30ac.
- Ledger publication commit: 7306ca846a2390a976cdd5574259ab9758b1ae05; CI run #7 passed for this head.
- [PR #3 — coordination foundation](https://github.com/Rakshak-D/SixSeven/pull/3) was merged with a merge commit after [CI run #8](https://github.com/Rakshak-D/SixSeven/actions/runs/45586356601) passed on reviewed head aa1b3c6d97b8c7bb225998adf8247b599b982ea0. Local main was synchronized by fast-forward. See the backend ledger for verification.
- Latest synchronized main for M4: `c34eb6e4077f1eeb38ef3312b55df3011007d416`, merge commit for PR #11. PR CI run #29 passed migration, upgrade, repeatable seed and all 81 PostgreSQL-backed tests at head `a0d7584fa479657af0af90b7d350dc474572214f`; main CI run #30 passed on the merge commit.
- M5: [PR #14](https://github.com/Rakshak-D/SixSeven/pull/14) merged at `1a81e780fbba7a47012f928a0b86b1f64d56770e`; [PR CI #49](https://github.com/Rakshak-D/SixSeven/actions/runs/45641035558) and [main CI #50](https://github.com/Rakshak-D/SixSeven/actions/runs/45641473492) passed all 102 PostgreSQL-backed tests. Local main is synchronized to the merge commit.

## Next authorized milestone

Await the next specification-authorized milestone. Keep frontend request items #4–9 and #11 open for separate product review; M5 did not change the project creator role, add invitation workflows, or replace checklist state transitions.
