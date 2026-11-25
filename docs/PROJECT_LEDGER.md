# Project Ledger — Slate / SixSeven

Maintained by Codex. This is the coordination source of truth; Claude records frontend work only in FRONTEND_LEDGER.md.

## Identity and specification

- Project: Slate
- Team: SixSeven
- Repository: https://github.com/Rakshak-D/SixSeven
- Problem statement reference: the inherited README calls this hackathon problem 21 and describes a construction-site tracker. The official problem statement is not present; treat that description as provisional until supplied by the technical lead.
- Event constraints: the task brief confirms a 24-hour hackathon. Start time, exact deadline, judging schedule, and remaining time are not confirmed. Time cues in older scaffold notes are unverified and are not project constraints.
- Full architecture, dependency constraints, acceptance criteria, and feature specifications: pending technical-lead handoff.

## Current architecture reference

The repository currently contains one Next.js App Router app, Hono at /api/v1, Drizzle/PostgreSQL, Better Auth dependencies, shared Zod files, and generated OpenAPI wiring. This is the scaffold topology, pending confirmation against the full specification. Do not create a separate backend application.

## Milestones and dependencies

| Milestone | State | Dependency / exit condition |
|---|---|---|
| M0 — repository foundation and ownership | IN_PROGRESS — local verification recorded; publication pending | Complete when the branch and reviewable PR are published. Do not merge without user approval. |
| M1 — specification intake | PLANNED | Requires the full official problem statement, architecture, dependencies, features, event deadline, and acceptance criteria. |
| M2 — API and data contract | PLANNED | Requires M1; define and review the shared contract before dependent frontend/backend work. |
| M3 — authorized vertical slice | PLANNED | Requires M2 and a technical-lead-approved milestone. Scope comes only from the supplied specification. |
| M4 — integrated verification and demo readiness | PLANNED | Requires implemented backend and frontend paths plus approved test data and environment. |

This is an ordering for coordination, not a feature commitment. Re-plan M1 onward against the official specification.

## Priorities

- P0: publish and review the M0 foundation; receive the complete specification and exact event deadline before feature work.
- P1: after M1, agree the first API/data contract and build only the authorized user journey.
- P2: after a complete journey works, address specification-approved polish and remaining lower-priority work.

Feature-level priority is not assigned until the official brief is available.

## Status snapshot

- Overall: IN_PROGRESS — M0 local changes are verified; commit, push, and PR publication are pending. Not merged or integration-tested.
- M0 changes: IN_PROGRESS — local verification is recorded in BACKEND_LEDGER.md; publication remains.
- Existing scaffold: one health handler and OpenAPI document generator; all other route modules are empty routers. Database schemas are empty, initial migration is SELECT 1, seed is a no-op, and current tests cover health plus the shared money helper.
- No business feature is recorded as implemented or integrated.
- Frontend: FRONTEND_LEDGER.md already has Claude's initialization and backend requests; Codex leaves it unchanged.

## Integration checkpoints

1. Technical lead supplies and approves the full problem statement, stack, deadline, and acceptance criteria.
2. Codex updates docs/API.md and shared schemas from the approved specification; merge the contract-only change before dependent work.
3. Codex implements backend routes and data rules with backend tests.
4. Claude implements frontend pages using the agreed contract and clearly marked contract-derived mocks.
5. Integrate active work with merge commits and exercise the approved end-to-end journey before marking INTEGRATED.

## Blockers

- Official problem statement and feature specification not yet supplied.
- Event start/end time and confirmed schedule not supplied.
- Authentication/authorization contract and endpoint request/response schemas are not defined for the proposed routes.
- GitHub reports main as unprotected. Repository rulesets were empty at M0 inspection; do not change settings without approval. Enforce PR-only behavior in agent instructions.
- No project-local database was started or verified in M0.

## Risks

- The repository is public; all committed content is public.
- The scaffold contains detailed product assumptions and unimplemented route/schema notes that could be mistaken for requirements.
- External Claude artifact links in the inherited instructions were not read or verified in this work.
- Branch protection is absent, so contributors must honor the PR-only process.
- The frontend ledger records that a prior scaffold session started local services and used paths outside the project; this M0 run did not verify or alter that prior environment state.

## Git baseline and publication

- Previously observed reference main: d8aadaabe53233a724b421693ac6cdbb9f1f326d (historical reference only).
- Last verified main: 29b06094031f1fab470aa3c648c2ff2734af7e73.
- M0 branch: chore/coordination, created from the verified main above.
- M0 commit: pending publication.
- Pull request: pending publication; target main.
- Merge status: not merged. INTEGRATED is prohibited until merge and integration testing.

## Next authorized milestone

M1 specification intake only after the technical lead supplies the detailed project brief and exact time constraints. Do not begin business-feature implementation before that handoff.
