# Project Ledger — Slate / SixSeven

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
| M4 — attendance, wage accounting and corrections | IN_PROGRESS | Labour APIs, exact wage reports, append-only migrations, PostgreSQL verification and integration required before merge. |
| Demo readiness | PLANNED | Requires implemented paths plus isolated test data and an exercised journey. |

## Priorities

- P0: complete attendance and project-scoped operational records.
- P1: labour accounting, corrections, financial reporting, progress and audit operations.
- P2: proposals and reviewed checklist drafts.

## Status snapshot

- Overall: M4 is implementing attendance, wage payments, correction history, exact wage calculations and downloadable wage sheets on top of the verified M3 stock ledger.
- Frontend: FRONTEND_LEDGER.md already has Claude's initialization and backend requests; Codex leaves it unchanged.

## Integration checkpoints

1. Technical lead approved the repository baseline. See SPECIFICATION.md.
2. Integrate M1 shared schemas and docs/API.md before dependent implementation.
3. Codex implements backend routes and data rules with backend tests.
4. Claude implements frontend pages using the agreed contract and clearly marked contract-derived mocks.
5. Integrate active work with merge commits and exercise the approved end-to-end journey before marking INTEGRATED.

## Blockers

- Event start/end time and confirmed schedule not supplied.
- M4 PostgreSQL integration and CI verification remain pending on `be/labour-accounting`.
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

## Next authorized milestone

After M4 is merged and main CI is verified, the next scope is the owner budget summary, progress/photo storage and project activity visibility.
