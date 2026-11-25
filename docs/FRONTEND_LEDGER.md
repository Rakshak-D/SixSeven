# Frontend ledger

Maintained only by the frontend agent (Claude Code, supervised by the frontend developer). Newest entry
first. Status words: **MOCKED** (works against `src/mocks/` only) · **IMPLEMENTED** (code written,
checks pass) · **VERIFIED** (exercised in a browser at phone and desktop sizes) · **INTEGRATED**
(verified against the live backend route).

## Feature status

| Screen / feature | Route | API it needs | Status |
|---|---|---|---|
| _none started_ | | | |

## Backend requests

Open requests to the backend team. Each one: user journey, why the current API is insufficient,
proposed method + path, fields, priority / blocking.

| # | Request | Journey | Priority | Status |
|---|---|---|---|---|
| 1 | Shared Zod schemas (`src/shared/schemas/<resource>.ts`) for the Must routes in `docs/API.md`, starting with projects, materials, workers, deliveries, usages, attendance and stock | All Must screens: the frontend builds forms and mocks from these | High; frontend mocks wait on it, design work doesn't | Open |
| 2 | Auth flow agreement: Better Auth session endpoints the login screen calls, and how the 3 demo users log in | Login + demo role picker | High; login screen | Open |
| 3 | Root `AGENTS.md` still describes 4 lanes; update it to the 2-team ownership when the coordination docs land | Agents read the wrong ownership table | Medium | Open |

## Entries

### 2026-11-25 14:05 IST · Frontend foundation and working agreement

- **Branch / commit:** `fe/foundation` (from `main` at `ade6a46`)
- **Done:** read the repo, `AGENTS.md` files and `docs/API.md`; accepted the frontend working
  agreement (file ownership, `fe/*` branches + PRs only, mocks follow the contract, no silent mock
  fallback, dependency and shared-file changes go through the backend team). Started this ledger.
- **Repo state:** `main` holds the scaffold (PR #1) and the rename to Slate (`ade6a46`, pushed to
  `main` directly at the developer's request, before this agreement). No backend branches or
  coordination docs (`PROJECT_LEDGER`, `BACKEND_LEDGER`, `DECISIONS`, `DISCLOSURES`) yet.
- **Files changed:** `docs/FRONTEND_LEDGER.md` (new).
- **API dependencies:** none yet. Only `GET /api/v1/health` and `/api/v1/doc` are live.
- **Mocked vs live:** nothing built.
- **Tests:** none needed for a docs-only change.
- **Writes outside the project so far (scaffold session):** pnpm installed to `~/.local/bin`;
  Playwright Chromium in `~/.cache/ms-playwright` (left in place, other projects share that cache);
  screenshots in a temporary folder under `/tmp`; agent notes under `~/.claude`. From now on,
  browsers live in `.cache/ms-playwright/` and screenshots in `.artifacts/` inside the project, both
  ignored through `.git/info/exclude` (local only; no shared `.gitignore` change).
- **Local processes:** dev server on :3000 and the `slate-db-1` Postgres container, kept running.
- **Design decisions:** none yet; 2–3 visual directions go to the frontend developer first.
- **Blockers:** none for design work. Mocks and forms need backend request 1.
- **Next:** pitch design directions, then build login + layout shell + Today screen on mocks.
