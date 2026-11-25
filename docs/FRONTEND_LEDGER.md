# Frontend ledger

Maintained only by the frontend agent (Claude Code, supervised by the frontend developer). Newest entry
first. Status words: **MOCKED** (works against `src/mocks/` only) · **IMPLEMENTED** (code written,
checks pass) · **VERIFIED** (exercised in a browser at phone and desktop sizes) · **INTEGRATED**
(verified against the live backend route).

## Feature status

| Screen / feature | Route | API it needs | Status |
|---|---|---|---|
| All main screens, round 2 (prototype page, not app code) | n/a | demo data; needs requests 4–11 | MOCKED (prototype) |

## Backend requests

Open requests to the backend team. Each one: user journey, why the current API is insufficient,
proposed method + path, fields, priority / blocking.

| # | Request | Journey | Priority | Status |
|---|---|---|---|---|
| 1 | Shared Zod schemas for the Must routes | All Must screens | High | Done: published in `src/shared/schemas/` and `docs/API.md` |
| 2 | Auth flow agreement for login | Login + demo accounts | High | Done: Better Auth routes in `docs/API.md` |
| 3 | Root `AGENTS.md` to the 2-team ownership | Agents read ownership | Medium | Done |
| 4 | **Engineer creates projects and invites the owner and contractor.** Today `POST /projects` makes the creator the contractor and `POST /projects/:id/members` is contractor-only for existing accounts. Proposed: creator becomes engineer; members route is engineer-only; invitations by email with a pending state (`GET /invitations` for the signed-in user, `POST /invitations/:id/accept`). Owner and engineer may belong to many projects. Contractor still adds materials and workers. | Project setup, project list, invitations | High; changes a P0 rule in `SPECIFICATION.md` | Open |
| 5 | **Remove a worker with a reason** (soft: `active:false`, reason ≥ 5 chars, kept with attendance and wages). Proposed `POST /projects/:id/workers/:workerId/deactivate {reason}`; worker list returns `removedReason`, `removedOn`. Adding workers mid-project already works. | Team screen | Medium | Open |
| 6 | **Expected deliveries with accept / reject.** Contractor or engineer schedules: `POST /projects/:id/expected-deliveries {materialId, qty, supplier, expectedOn, note?}`; `GET` lists open ones. Contractor on arrival: `POST /expected-deliveries/:id/accept` with the normal delivery fields (creates the delivery, same challan rules), or `POST /expected-deliveries/:id/reject {reason ≥ 10, newDate?}`. A rejection never touches stock, shows in activity, and is readable by all members. | Today → Delivery, owner and engineer logs | Medium; differentiator | Open |
| 7 | **Task completion with photo proof, checked by the engineer.** Item status `todo / doing / waiting / done / sent_back`. Contractor: `POST /checklist-items/:id/start`, `POST /checklist-items/:id/completion` (multipart, 1 photo required, note required) → `waiting`. Engineer: `POST /checklist-items/:id/review {decision: accept / send_back, note}` (note ≥ 10 chars for send back). Proof photos join the timeline. | Today → Tasks, Site, owner progress | High; core of the owner view | Open |
| 8 | **Checklist edits need a reason and keep history.** Engineer: add item `POST /projects/:id/checklist-items {phase, task, reason}`, rename `PATCH /checklist-items/:id {task, reason}`, delete (soft) with reason. Each item returns its change history. | Site checklist | Medium | Open |
| 9 | **Payment modes and references:** add `Cheque`; reference required by mode: UPI 12-digit transaction ID, Bank UTR/reference 6–22 letters or digits, Cheque 6-digit number, Cash none. Changes `wages.CreateWagePaymentInput`. | Wages → record payment | Medium | Open |
| 10 | **Weekly spend series in the summary** for the overview chart: `spendByWeek: [{weekStart, materialsPaise, wagesPaise, otherPaise}]` (engineer gets totals only). Stock-over-time and checklist progress the frontend can derive from movements and checklist reads. | Owner overview charts | Medium | Open |
| 11 | **Engineer can read the dated attendance log without money fields** (who came each day), so the engineer's Logs screen matches the owner's. | Logs screen | Low | Open |

## Entries

### 2026-11-25 16:40 IST · Prototype round 2 from the frontend developer's review

- **Branch / commit:** `fe/workflow-requests` (ledger only). Prototype page updated in place (not app code).
- **Done:** worked through the developer's 13 review comments and their answers. New in the prototype:
  engineer creates projects and invites the owner and contractor (pending invitations with Accept);
  owner and engineer see several projects; expected deliveries the contractor accepts (opens the
  delivery form with the challan) or rejects with a reason and optional new date; Today tabs Delivery,
  Usage, Attendance, Tasks, each with its own dated log including older days and a Fix button per
  entry; owner and engineer get a read-only Logs screen; tasks are ticked off with a required photo
  (camera or gallery) and the engineer accepts or sends them back; checklist add / rename / delete
  needs a reason and keeps history; owner sees work progress per phase; Team screen adds workers
  mid-project and removes them with a reason (records kept); payments add Cheque and ask for the
  reference that matches the mode; payments grouped by date; charts: budget ring, spend per week,
  materials used vs in stock, checklist progress, stock over time, wages per day; big numbers in
  short Indian units (₹22.3 L) with the exact value on tap.
- **Parked:** checklist import from a Revit export (developer will describe it later).
- **Files changed:** `docs/FRONTEND_LEDGER.md` (backend requests 4–11, this entry).
- **API dependencies:** requests 4–11 above; the rest maps to routes already in `docs/API.md`.
- **Mocked vs live:** prototype only, demo data.
- **Tests:** scripted Playwright run over every new flow (engineer accepts a proof, adds and renames
  a task with reason; contractor accepts an invitation, accepts an expected delivery, duplicate
  challan blocked, rejects a delivery with reason and new date, usage over stock blocked, fix opened
  from a log entry pre-selects that entry, task done requires a photo, worker added and removed with
  reason, UPI reference validated; engineer sends a task back; owner approves a change, reads logs,
  taps a short number to see it exact). Screenshots of every screen at 390, 768 and 1440 px in light
  and dark: no horizontal overflow, no console errors.
- **Design decisions:** the final visual design will change; this round settles UX and features.
- **Blockers:** requests 4 and 7 change backend rules; frontend can build against mocks meanwhile.
- **Next:** developer confirms the workflow; then build the real screens in `src/app/` against the
  published contracts, mocking requests 4–11 until they land.

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
