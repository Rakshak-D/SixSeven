# Frontend ledger

Maintained only by the frontend agent (Claude Code, supervised by the frontend developer). Newest entry
first. Status words: **MOCKED** (works against `src/mocks/` only) · **IMPLEMENTED** (code written,
checks pass) · **VERIFIED** (exercised in a browser at phone and desktop sizes) · **INTEGRATED**
(verified against the live backend route).

## Feature status

| Screen / feature | Route | API it needs | Status |
|---|---|---|---|
| Owner Home: left in budget, spent over time (from `spendByWeek`), needs you, today on site, recent spends with filters, material use vs plan, stock sparklines | `/projects/[id]` (owner) | summary, stock, movements, materials, activity, proposals, checklists, wage-payments, workers, adjustments | MOCKED, verified in a browser |
| Owner approvals (centre button and Home): approve or reject proposed changes | sheet | `GET /projects/:id/proposals`, `POST /proposals/:id/decision` | MOCKED, verified in a browser |
| Logs: spends (wages folded per day), stock movements, attendance per day, fixes with old → new and reason | `/projects/[id]/logs` | movements, materials, wage-payments, workers, attendance, adjustments | MOCKED, verified in a browser |
| Site: work by phase, changes, progress timeline | `/projects/[id]/site` | checklists, proposals, timeline | MOCKED, verified in a browser |
| Money: where it went, spend per week, wage sheet by range (CSV/PDF links when signed in) | `/projects/[id]/money` | summary, wage-sheet | MOCKED, verified in a browser |
| Logo: mark and lockup in the nav, phone bar and project list; favicon | all | none | VERIFIED |
| App shell: floating top nav (desktop), bottom dock (phone), project switcher, role action sheets, project list and home | `/projects`, `/projects/[id]` and its `logs`, `site`, `money`, `stock`, `wages` placeholders | `GET /projects` (mocked: needs a session, login not built) | MOCKED, verified in a browser |
| Design tokens, fonts, theme toggle, restyled ui primitives | `/styleguide` (development only, 404 in production) | none | VERIFIED |
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
| 10 | **Weekly spend series in the summary** for the overview chart: `spendByWeek: [{weekStart, materialsPaise, wagesPaise, otherPaise}]` (engineer gets totals only). Stock-over-time and checklist progress the frontend can derive from movements and checklist reads. | Owner overview charts | Medium | Contract available (`SummaryResponse.spendByWeek`, PR #13); backend planned for M5 |
| 11 | **Engineer can read the dated attendance log without money fields** (who came each day), so the engineer's Logs screen matches the owner's. | Logs screen | Low | Open |
| 12 | **Project team list with names and phone numbers** for the dashboard's Team panel (tap to call the engineer or contractor). Today there is no route that lists members, and `ProjectMemberResponse` is only `{userId, role}`. Proposed: `GET /projects/:id/members` for any member, returning `[{userId, role, name, phone?}]`; the phone is optional, set by the user (`PATCH /me {phone}`, Indian mobile format), and visible only to members of a shared project. Until it lands the panel shows roles only. | Dashboard → Team panel | Low | Open |
| 13 | **Anti-fraud: per-bag codes at delivery.** The engineer scans each bag's code (the brand's printed QR, or a numbered tamper-evident sticker we supply) while verifying a delivery, and the codes are linked to that delivery. Proposed: `POST /deliveries/:id/bag-codes {codes[]}` for the engineer; a code already known in the project gives 409. The delivery returns `verifiedBy`, `verifiedAt`, `bagCodeCount`. | Today → Delivery, engineer verify | High; core of the anti-fraud plan | Open |
| 14 | **Anti-fraud: bag codes required at use.** `CreateUsageInput` gains `bagCodes[]` (one per bag used). It saves only if every code belongs to a delivery of that material in the project and is unused; otherwise it is refused with distinct error codes (`BAG_CODE_UNKNOWN`, `BAG_CODE_USED`, `BAG_CODE_WRONG_MATERIAL`). Later: an empty-bag count checked against bags used. | Today → Usage | High | Open |
| 15 | **Anti-fraud: steel hold point.** A checklist item flagged as a pour cannot move to done ("ready to pour") until the engineer attaches photos of the bar markings (brand, BIS mark, MTC number). Proposed: a `requiresSteelProof` flag on checklist items and a refusal code when proof is missing. | Site → checklist | Medium | Open |
| 16 | **Approved suppliers and locked bank details.** The owner approves each supplier (name, GSTIN, bank account). A bank change is a pending request that needs owner approval, waits 24 to 48 hours, and alerts the owner. Contractors cannot read bank fields or call these routes. Proposed: `GET/POST /projects/:id/suppliers`, `POST /suppliers/:id/bank-change-requests`, `POST /bank-change-requests/:id/approve`. | Owner → suppliers | High | Open |
| 17 | **Pre-approved orders, spending rules and a delegate.** The owner creates orders `{supplierId, materialId, qty, maxUnitPricePaise}`, sets rules `{perBillCapPaise, perWeekCapPaise}`, and may name one delegate (a family member, or the engineer up to a limit; never the contractor). Proposed: `POST /projects/:id/orders`, `PUT /projects/:id/payment-rules`, `PUT /projects/:id/delegate`. | Owner → orders and rules | High | Open |
| 18 | **Mock payment release.** When the engineer verifies a delivery that matches an order (supplier, quantity, price cap) and fits the rules, the server creates a mock payment for an amount it calculates, with an idempotency key. Anything else waits in an owner pending list: `GET /projects/:id/payments?status=pending`, `POST /payments/approve {ids[]}` (approve all), `PUT /projects/:id/auto-pay {paused}`. Every auto-payment appears in activity. Responses say the provider is a mock. This changes the specification rule that contractors record payments; it needs technical-lead approval. | Owner → approvals, digest | High; changes a P0 rule | Open |
| 19 | **Fraud flags** in the summary for owners: new supplier, bank change, a rate far above recent buys, a payment with no verified delivery, an entry with no engineer confirmation, repeated delays. Proposed `fraudFlags: [{kind, refType, refId, raisedOn}]` on `SummaryResponse` for owners only. | Owner dashboard | Medium | Open |

## Entries

### 2026-11-25 20:39 IST · Owner side, full demo mocks, logo

- **Branch / commit:** `fe/owner-screens`, stacked on `fe/design-tokens` (PR #16).
- **Mocks:** `src/mocks/world.ts` simulates each demo project day by day from its start date
  (relative to today) to now:
  - deliveries and daily usage that never go below zero
  - attendance for the crew, weekly wage payments and a few advances
  - three corrections (a half day, a delivery quantity, a payment amount)
  - proposals, a checklist and progress notes
  `src/mocks/routes.ts` answers every owner read route from that world. Every response is parsed
  with its shared schema, the routes follow the documented role rules (engineers get 403 on
  worker-level routes and see no payment activity), and decisions and checklist updates change the
  in-memory world. Mocks run in the browser, so a reload resets them. `src/mocks/routes.test.ts` calls
  every read route for every role and checks:
  - the spend split and the weekly series add up to the total
  - stock never goes negative
  - only the owner can decide, and only once
- **Screens (owner):**
  - **Home:**
    - left in budget, with the exact amount on tap and the split bar
    - spent over time, the smooth area chart; drag or use the arrow keys to look back
    - needs you: pending changes, low stock, materials over plan
    - today on site, written as readable lines from activity
    - recent spends with the filter sheet and removable chips
    - material use vs plan (hatched = planned from `materialVariance`, solid = used, amber = over
      tolerance)
    - stock with 14-day sparklines rebuilt from dated movements
  - **Approvals:** the centre button and Home share one list; approve and reject call the decision
    route.
  - **Logs:** spends, with each day's wage payments folded into one expandable line; stock
    movements; attendance per day; fixes.
  - **Site:** phase progress, changes, progress timeline. Photos are a labelled placeholder while
    mocks are on; live photos use the protected same-origin route.
  - **Money:** where it went, weekly stacked bars (materials + wages add up to the week), wage sheet
    for this week, the last 30 days or the whole project. CSV and PDF are links to the real export;
    under mocks they say they need sign-in.
- **Logo:** the final "J" lockup from the logo drafts canvas. The mark (orange slab, ink courses
  following the theme) sits in the desktop nav, the phone top bar and the project list (with the
  tagline). `src/app/icon.svg` is the two-slab favicon. The wordmark uses Newsreader to match the
  app (the drafts used Instrument Serif). No Apple touch icon: it needs a PNG.
- **Honest limits shown in the UI:** "Other" spend stays at zero (no write endpoint); Team needs
  request 12; downloads need sign-in.
- **Tests:**
  - `pnpm lint`, `pnpm typecheck`: pass; `vitest run src`: 41 pass.
  - Playwright on every owner screen at 390 and 1440 px, light and dark: no overflow, no console
    errors, nothing tappable under 44 px.
  - Owner flows pass:
    - approving drops the pending count
    - the wages filter shows only wage rows, and its chip clears it
    - the chart scrubs by keyboard
    - fixes show old → new with the reason
    - the wage-sheet range changes the totals
- **Next:** contractor side (Today forms, Stock, Wages), then engineer (Review, checklist updates).

### 2026-11-25 20:12 IST · Stage 2: app shell

- **Branch / commit:** `fe/design-tokens` (uncommitted, on top of stage 1).
- **Decisions (frontend developer, today):** URLs are `/projects/[id]/…`, one set of pages that adapt to
  the role, because roles are per project. The empty `(owner)`, `(contractor)` and `(engineer)` route
  groups are removed. Tabs and centre actions: owner Home · Logs · Approvals · Site · Money; contractor
  Today · Stock · + Log · Site · Wages; engineer Home · Logs · Review · Site · Stock. Team, invitations
  and project settings sit behind the project switcher. The shell runs on mocks until login exists.
- **Done:**
  - `/` redirects to `/projects`, a project list with each project's role.
  - `/projects/[id]` wraps every project page in the shell:
    - desktop (1024 px and up): a floating top nav with a sliding tab indicator, the project switcher,
      a "Demo data" badge, the role's action button and the theme toggle
    - phone and tablet: a floating bottom dock with the action in the centre, and a top bar with the
      switcher and the toggle
  - A shared `Sheet` (bottom sheet on phone, right panel on desktop, Radix Dialog) is used by the
    switcher and the action sheets. The action sheets state plainly that their lists and forms are not
    connected yet; nothing reports fake success.
  - Project home shows only contract fields: name, location, start date, budget.
  - The other tabs are labelled "Not built yet".
  - Unknown project and 401 states have honest messages.
- **Files:**
  - new: `src/components/shell/*`, `src/components/sheet.tsx`, `src/hooks/use-projects.ts`,
    `src/lib/format.ts`, `src/mocks/projects.ts`, `src/mocks/types.ts`, `src/app/projects/**`
  - changed: `src/mocks/index.ts`, `src/lib/api/client.ts` (one shared `mocksEnabled` flag),
    `src/app/page.tsx`, `src/app/globals.css` (sheet, panel and dock animations)
  - removed: the three role-group `.gitkeep` files
- **API dependencies:** `GET /projects` is live but needs a session; mocked with three demo projects
  (one per role) parsed through `ProjectsResponse`. Delete the mock when login lands.
- **Tests:**
  - `pnpm lint`, `pnpm typecheck`: pass.
  - `vitest run src`: 37 pass, including new tests for the role tabs, href and active-tab matching, the
    demo fixtures, and money and date formatting.
  - Playwright at 390, 768 and 1440 px, light and dark, over the project list and one project per role:
    no horizontal overflow, no console errors, top nav only at 1024 px and up, dock only below, nothing
    tappable under 44 px.
  - Playwright flows:
    - a tab click moves the indicator and sets `aria-current`
    - Approvals opens and Escape closes
    - switching to the contractor project switches the tabs and the action to Log
    - the phone dock navigates
    - + Log opens the quick-log sheet
    - content ends above the dock
    - an unknown project shows "Project not found"
- **Next:** stage 3, the overview blocks on contract-checked mocks (requests 6, 10, 12).

### 2026-11-25 20:40 IST · Stage 1: design tokens

- **Branch / commit:** `fe/design-tokens` from `main` at `3860e93`.
- **Done:** replaced the shadcn neutral theme in `src/app/globals.css` with the Slate tokens: cream
  light theme and warm near-black dark theme. Token names stay shadcn's, so the primitives keep their
  APIs; Slate-only tokens added are band, ink-2, line-strong, success, warning, the category colours,
  tile and scrim. One easing curve (`ease-slate`), three durations, rise, drop and fade animations, a
  `num` utility for tabular figures, and a global reduced-motion rule. Fonts are Newsreader (headings,
  italic, optical size) and Geist (body) through `next/font/google`, self-hosted at build. Restyled
  button, card, input, select, dialog, tabs and badge to pills, larger radii and 44px touch targets. New
  `ThemeToggle` (system default, remembered choice, one view-transition crossfade). New
  development-only `/styleguide` page to review the tokens.
- **Files changed:** `src/app/globals.css`, `src/app/layout.tsx`, `src/app/styleguide/page.tsx`,
  `src/components/theme-toggle.tsx`, `src/components/ui/{badge,button,card,dialog,input,select,tabs}.tsx`,
  this ledger.
- **API dependencies:** none. **Mocked vs live:** the styleguide shows sample copy only.
- **Tests:** `pnpm typecheck` pass; `pnpm lint` pass; `pnpm build` pass. A contrast script checked every
  text and surface pair in both themes: all pass 4.5:1 after darkening the light-theme orange, green and
  red. A Playwright script at 390, 768 and 1440 px, light and dark, found no horizontal overflow and no
  console errors. It also confirmed the system theme applies, both fonts load, nothing tappable is under
  44px, the toggle applies and persists across reload, tabs switch, and reduced motion stops
  animations. A production start returns 404 for `/styleguide` and makes no Google Fonts requests.
  `pnpm test` NOT_RUN: there are no frontend unit tests yet, and the backend suite needs the database,
  which this change does not touch.
- **Next:** stage 2, the floating top nav (desktop) and bottom dock (phone).

### 2026-11-25 19:42 IST · Anti-fraud plan into AGENTS.md, charts and type settled

- **Branch / commit:** `fe/workflow-requests`, fast-forwarded to `main` at `c56504f`.
- **Handoff to Codex (AGENTS.md edited by Claude):** the frontend developer approved the team doc
  "SixSeven: Anti-Fraud and Payments Plan" and asked Claude to record it in the AGENTS.md files
  directly. This is a one-off exception to the rule that Codex maintains them; please review it.
  Files: root `AGENTS.md` (new "Planned feature: anti-fraud and payments" section), `src/server/`,
  `src/db/`, `src/shared/`, `src/app/` and `tests/` AGENTS.md (one planned-rules paragraph each). Every
  addition is marked PLANNED and not yet authorized. Expected from Codex: fold the plan into
  `docs/SPECIFICATION.md` (including the contractor payment rule change, which needs technical-lead
  approval), `docs/DECISIONS.md`, a contract and a milestone, then answer requests 13 to 19.
- **Design decisions:** headings in Newsreader, body in Geist. Charts are smooth lines with an area
  fill that fades out, light vertical guides, a ringed end dot with the value above it, and the current
  point marked in the accent colour; dragging moves the dot back in time. There is no planned or expected
  spend: projects have no spend plan, so the hatched "planned" bars are gone. The overview chart is
  total spent over time from `spendByWeek` (request 10, contract available). The hero number is now
  "left in budget", so the chart and the hero don't repeat the same figure.
- **Files changed:** `docs/FRONTEND_LEDGER.md` (requests 13 to 19, request 10 status, this entry), the
  six AGENTS.md files above.
- **Mocked vs live:** nothing in `src/` yet; the direction board is a private design canvas.
- **Tests:** none for docs-only changes.
- **Next:** Codex reviews the AGENTS.md handoff; frontend starts plan stage 1 (design tokens).

### 2026-11-25 17:30 IST · Visual direction reset

- **Branch / commit:** `fe/workflow-requests` (ledger only).
- **Done:** the frontend developer dropped the "Slate and chalk" look (yellow action colour, earlier
  type) entirely; the round 2 workflow stays. New direction from four references: modern serif for
  headings, modern sans for body, warm near-black and cream themes (both first-class), one orange
  action colour, a grainy gradient orb as decoration only, floating top navigation on desktop and a
  floating bottom dock on phone, solid surfaces (no glass blur), smooth motion that stops under
  reduced motion. A direction board (static page, not app code) comes next for review.
- **Files changed:** `docs/FRONTEND_LEDGER.md` (backend request 12, this entry).
- **API dependencies:** request 12 (team list with names and phones); weekly spend chart still needs
  request 10.
- **Mocked vs live:** nothing in `src/` yet.
- **Tests:** none for a docs-only change.
- **Next:** direction board for review, then the plan's staged PRs.

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
