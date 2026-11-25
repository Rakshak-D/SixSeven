# Frontend ledger

Maintained only by the frontend agent (Claude Code, supervised by the frontend developer). Newest entry
first. Status words: **MOCKED** (works against `src/mocks/` only) · **IMPLEMENTED** (code written,
checks pass) · **VERIFIED** (exercised in a browser at phone and desktop sizes) · **INTEGRATED**
(verified against the live backend route).

## Feature status

| Screen / feature | Route | API it needs | Status |
|---|---|---|---|
| All main screens (prototype page, not app code) | n/a | none, demo data | MOCKED (prototype) |

## Backend requests

Open requests to the backend team. Each one: user journey, why the current API is insufficient,
proposed method + path, fields, priority / blocking.

| # | Request | Journey | Priority | Status |
|---|---|---|---|---|
| 1 | Shared Zod schemas (`src/shared/schemas/<resource>.ts`) for the Must routes in `docs/API.md`, starting with projects, materials, workers, deliveries, usages, attendance and stock | All Must screens: the frontend builds forms and mocks from these | High; frontend mocks wait on it, design work doesn't | Open |
| 2 | Auth flow agreement: Better Auth session endpoints the login screen calls, and how the 3 demo users log in | Login + demo role picker | High; login screen | Open |
| 3 | Root `AGENTS.md` still describes 4 lanes; update it to the 2-team ownership when the coordination docs land | Agents read the wrong ownership table | Medium | Open |

## Entries

### 2026-11-25 15:06 IST · Design direction B + clickable prototype

- **Branch / commit:** `fe/prototype-ledger` (ledger only; the prototype is a standalone page, not app code)
- **Done:** the frontend developer picked direction B, "Slate and chalk": slate ground, chalk text,
  pastel chalk status colours, Instrument Serif for headings and money, Schibsted Grotesk for UI, with
  a light variant for outdoor use. Built every main screen as a clickable single-page prototype on the
  Greenfield Home demo data, to decide the real workflow from:
  login + demo roles, projects, new project, Today (delivery, usage, attendance, photo), stock,
  overview (KPIs, budget split, daily spend chart, alerts, photo timeline, activity), wage sheet (range,
  totals, payments, CSV and PDF previews), fixes (adjustments), site (checklist, progress update,
  propose change), changes (owner approve / reject).
- **Files changed:** `docs/FRONTEND_LEDGER.md`. Prototype lives outside git in `.artifacts/` and is
  shared as a private page.
- **API dependencies:** none (prototype runs on in-page demo data).
- **Mocked vs live:** everything in the prototype is demo data; nothing is in `src/` yet.
- **Tests:** scripted Playwright run of the demo flow: duplicate challan blocked, usage of 70 with 60
  in stock blocked, attendance total ₹2,700 for P/P/½/P/A, adjustment of a half day raises earned
  wages by ₹300, engineer sees no wage entries and gets "Not available" on wages, owner approval
  recorded. Screenshots of every screen at 390, 768 and 1440 px (light and dark): no horizontal
  overflow, no console errors.
- **Design decisions:** contractor screens phone-first with a bottom tab bar (rail on desktop);
  one yellow action colour; coral = blocked, orange = low stock, mint = fine; stock and wage numbers
  are always derived from entries; every correction is a "fix" with a reason and the old value stays
  visible.
- **Blockers:** none.
- **Backend requests:** still requests 1 and 2 (shared schemas, auth flow).
- **Next:** frontend developer reviews the prototype and gives the workflow; then build the real
  screens in `src/app/` against mocks.

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
