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
| 20 | **Approval chain for engineer changes (append-only).** Replaces the direct apply in request 8.<br>• **What goes through it:** checklist add, rename and remove; attendance fixes; medical expenses (request 23). Nothing is changed in place; a change applies only when the owner accepts it.<br>• **Model:** `ChangeRequest {id, projectId, kind: checklist_add \| checklist_rename \| checklist_remove \| attendance_fix \| medical_expense, targetId?, payload, authorId, authorRole, status, events[]}`. `events[]` is append-only `{kind: created \| contractor_approved \| contractor_rejected \| reopened \| owner_accepted \| owner_rejected, byUserId, role, note, at}`.<br>• **States:** an engineer's change starts at `pending_contractor`. Contractor approve → `pending_owner`; contractor reject → `rejected_contractor`, which stays out of the owner's queue but readable. Only the author can reopen (back to `pending_contractor`). Owner accept → `accepted` (the change applies in the same transaction); owner reject → `rejected_owner`. Both owner outcomes are final, with no reopen. A contractor's own fix or medical expense starts at `pending_owner`.<br>• **Routes:** `POST /projects/:id/change-requests {kind, targetId?, payload, note}`, `GET /projects/:id/change-requests?status=` (any member), `POST /change-requests/:id/vote {approve, note}` (contractor), `POST /change-requests/:id/reopen {note}` (author), `POST /change-requests/:id/decision {accept, note, payPaise?}` (owner). Every note is required (`Note`). A wrong state → 409, a wrong role → 403.<br>• **Not included:** the engineer's accept or send-back of the contractor's proof (request 7) stays as it is. | Engineer Site edits, contractor votes, owner Approvals | High; changes request 8 and the checklist rules in `SPECIFICATION.md` | Open |
| 21 | **Notes required everywhere.** Make these `Note` (required, not optional):<br>• `CreateDeliveryInput.note` and `CreateUsageInput.note`;<br>• the checklist review accept `note` (`checklist.ts`, today optional);<br>• the wage payment `note` (new, request 22);<br>• every decision: proposal decision, plus every vote, decision and reopen in request 20. | All forms | High | Open |
| 22 | **Wage payments: required note; no reference for cash.** Builds on request 9 (in progress on `be/wage-payment-modes`). Contractors still record wage payments.<br>• `CreateWagePaymentInput` gains a required `note`.<br>• For `mode: cash`, refuse a non-empty `reference`; the note is the record of who received the cash and where. | Wages → record payment | Medium | Open |
| 23 | **Medical emergencies.**<br>• **Attendance fix:** adjustments for `targetTable: attendance` gain `reasonKind: medical_emergency \| other` and `payFullDay: boolean` (only allowed with `medical_emergency`). `payFullDay` pays 2 half-days regardless of attendance.<br>• **Medical expense for an onsite accident:** `POST /projects/:id/medical-expenses` (multipart) `{workerId, billPaise, incidentOn, note}` plus 1–3 bill photos.<br>• **Chain and payment:** both go through request 20. When accepting, the owner sets `payPaise`, either the full bill or a partial amount up to the bill. The payment is a mock. It counts in the summary's `otherPaise`, and in `spendByWeek`. | Today → Fix, new Medical sheet, owner Approvals | High | Open |
| 24 | **Invite by phone as well as email.** Builds on request 4 (in progress on `be/project-invitations`).<br>• `CreateProjectInvitationInput` takes `email` or `phone` (Indian mobile, normalised to +91).<br>• A signed-in user sees invitations matching either their email or a verified phone.<br>• Also needed: an invitation list for the engineer, `GET /projects/:id/invitations` with `status: pending \| accepted`. | Project setup → invite | Medium | Open |
| 25 | **Supplier payments are owner-only, with autopay.** Extends requests 16–18; the spec change is approved (see the 2026-11-26 entry).<br>• **Contractors:** they cannot create, approve or read supplier payments or bank details.<br>• **Mandates:** each approved supplier can have `autopay {enabled, perBillCapPaise, perWeekCapPaise, paused}` (`PUT /suppliers/:id/autopay`, owner).<br>• **Release:** a mock payment releases only after the engineer verifies the delivery (request 13), for a server-calculated amount capped at the owner-approved order and the mandate caps. Everything else goes to the owner's pending list (request 18). | Owner → Money → Suppliers | High; changes a P0 rule | Open |
| 26 | **Keep the fix reason on the stock line.** Today `src/server/services/adjustments.ts` writes the compensating movement with the fixed note "Compensating stock correction", so the reason the user typed is lost in stock history. Write the adjustment's reason (or `Fix: <reason>`) as the movement note, or return `adjustmentId` on the movement so the client can show the reason. | Logs → stock, Spends | Medium; reported bug | Open |
| 27 | **Camera photos carry a capture time.** The app will take photos only from the live in-app camera, never the gallery. Each photo upload gains `capturedAt` (client time, stored and shown). The server refuses a `capturedAt` more than 10 minutes before the upload. This is not tamper-proof; it only makes old gallery photos harder to pass off. | Every photo upload | Low | Open |
| 28 | **Name the capture-time field** for medical bill photos (PR #34 mentions capture timestamps without a field name). The UI sends `capturedAt` per `billPhotos` part, in order. | Medical expense | Medium; needed with the routes | Open |

## Entries

### 2026-11-26 IST · Owner suppliers and autopay (MOCKED, demo data only)

- **Branch:** `fe/supplier-autopay`, on top of `fe/project-invites` (PR #38).
- **Status: MOCKED, and hidden on the live server.** No contract exists, so
  `lib/supplier-payments.ts` holds frontend-only shapes and the release rules for the demo. **The
  server must own these rules** (requests 16–18 and 25): replace the file's shapes with shared ones
  and never let a browser decide a payment.
- **Owner (Money):** suppliers with approval, per-supplier autopay with per-bill and per-week limits,
  pause all, approved orders, a bank-account change that needs approval then a 24-hour hold with an
  alert, waiting payments with the reason, and history. Home "Needs you" counts waiting payments.
- **Engineer (Home):** "Deliveries to verify", with a required note and no prices.
- **Contractor:** every supplier route answers 403 and no screen shows any of it.
- **Release rule:** after verification, a payment leaves by itself only for an approved supplier with
  a matching order, a rate within it, enough quantity left, autopay on and not paused, inside both
  limits. The amount never exceeds the order. A held bill is judged again each time it is read, and
  only the owner can then pay it.
- **Not built:** bag-code scanning (requests 13 and 14), so verification is only the engineer's word;
  the steel hold point (15), the delegate (17) and fraud flags (19). Do not describe this as fraud
  prevention.
- **Handoff to Codex:** `README.md` and `DISCLOSURES.md` must say the payment is a mock (AGENTS.md).
- **Checks:** Biome, typecheck, `vitest run src` (96 pass). Playwright on mocks: approve supplier and
  order, pay a held bill, bank change and alert, pause, autopay, add supplier, engineer verification,
  contractor sees nothing; 390, 768 and 1440, no sideways scroll at 390 and 1440.

### 2026-11-26 IST · Engineer attendance fix, starting a project, invites, team

- **Branch:** `fe/project-invites`.
- **Attendance fix (reported by Max):** it sent on demo data but looked broken. It now has a
  "Fix attendance" button on the engineer's Home (`logs?tab=attendance`), the form opens on a mark
  that differs from the current one, and a row with a waiting fix says so and hides Fix. On the live
  server it still needs the change-request routes (backend PR #37).
- **Team page** (`/projects/[id]/team`): names, roles and tap-to-call from the merged
  `GET /projects/:id/members` (handoff from PR #28). Setting your own phone is not built.
- **Start a project and invites: MOCKED, demo data only.** Hidden on the live server, which still
  makes the creator the contractor. `lib/invitations.ts` is a temporary copy of the shapes in
  backend PR #30; delete it and import from `shared/schemas/projects` when that merges. Then drop the
  `mocksEnabled` gates in `project-list.tsx` and `team-page.tsx`.
- **Not built:** phone invites and the engineer's list of sent invites (request 24); only this
  visit's invites show. A new project has no note field because `CreateProjectInput` has none.
- **Checks:** Biome, typecheck, `vitest run src` (87 pass). Playwright on mocks: attendance fix from
  Home, start a project, invite, accept an invite, the empty project's engineer pages; no page errors.

### 2026-11-26 IST · Approval chain and medical entries (MOCKED)

- **Branch:** `fe/approval-chain`, built on the contract from PR #34
  (`shared/schemas/change-requests.ts`). No frontend-only request or response types.
- **Status: MOCKED.** The change-request and medical routes are not built on the server. On live data
  (mocks off) these screens show the API's error, and engineer plan edits and attendance fixes cannot
  be saved until the routes land. The direct `PATCH`/`DELETE`/`POST checklist-items` calls and the
  direct attendance adjustment are no longer used by the UI.
- **Screens:** engineer Site edits ask for a change (the task keeps its value until accepted);
  engineer Logs has an Attendance tab from `/attendance/roster` with Fix; contractor votes on Today
  and Site; the contractor's own attendance fix goes to the owner; the owner decides in Approvals,
  with full or part payment for medical bills (labelled mock). Every step needs a note and shows in
  a trail. Medical expense is on Site and in the contractor's Log sheet.
- **Mocks:** `mocks/change-routes.ts` and `change-seed.ts`. Each demo project is one role, so the
  seeds give every role something to act on.
- **Question for backend (request 28):** the contract says bill photos come "with capture
  timestamps" but names no field. The UI sends one `capturedAt` (ISO) per `billPhotos` part, in the
  same order. Please confirm or name the field.
- **Not covered:** owner proposals still take no decision note (`DecideProposalInput`, request 21).
- **Checks:** Biome, typecheck, `vitest run src` (84 pass, including the chain's states, roles and
  pay limits). Playwright on mocks: reopen, rename request, attendance medical fix, contractor vote,
  medical bill with a stand-in camera stream, owner accept and part payment; 390, 768 and 1440,
  light and dark, no sideways scroll.

### 2026-11-26 IST · Fix reasons, required notes, payment proof, live camera

- **Branch:** `fe/fixes-notes-camera`, stacked on `fe/approvals-payments` (PR #32).
- **Bug fixed:** the reason typed for a stock fix was lost in stock history. The mock now writes
  `Fix: <reason>` on the correction line, and spends show `Fixed: <reason>`. The live server still
  writes a fixed sentence (request 26). Delivery notes now show in Logs, Today and spends.
- **Required notes (form checks only until request 21):** delivery, usage, and both review
  decisions. The engineer's review now has one note box used by Accept and Send back / Reject (the
  button label was already edited in the working tree).
- **Wage payments:** UPI needs a 12-digit ID and Bank needs 6 to 22 letters or digits. Cash hides
  the reference and requires a note. **Until request 22, the cash note is sent as `reference`**,
  because the schema has no note field. Please move those values when `note` lands.
- **Also fixed:** the selected tab's label vanished while hovered or tapped (`ui/tabs.tsx`).
- **Waiting on the contract:** the Cheque mode (`be/wage-payment-modes`) and a note on UPI and bank
  payments (request 22). Proposal decision notes arrive with the approval chain (request 20).
- **Camera:** `components/photos/camera-view.tsx`. A live viewfinder, back camera preferred, with the
  time printed on the picture. The gallery file input is gone. A blocked or missing camera blocks
  the upload with a plain message. It needs https or localhost, so `pnpm dev:lan` on a phone cannot
  open the camera.
- **Checks:** Biome, typecheck, `vitest run src`. Playwright on mocks: cash and UPI payment, camera
  blocked and capture (with a stand-in video stream, not real camera hardware), photo upload, usage
  note, stock fix reason in Logs, review note. Screenshots at 390 light, 768 dark and 1440.

### 2026-11-26 IST · Lint fix for frontend files that arrived through main

- **Why:** CI's Biome step failed on PR #32 because of two files already on `main` (the assistant
  widget commit and the sign-in page).
- **Changed:** `src/app/(auth)/sign-in/page.tsx` and `src/components/shell/ai-assistant-widget.tsx`,
  with `biome check --write` only: formatting, import order and one quote style. No behaviour change.
- **Checks:** Biome, typecheck and `vitest run src` (71 pass) are clean.

### 2026-11-26 IST · Requests for Codex: approvals, autopay, medical, invites

- **Branch:** `fe/approvals-payments`. This entry changes only this ledger; the UI follows in later PRs.
- **Spec changes approved by Max on 2026-11-26** (technical-lead approval; Codex please fold them into
  `SPECIFICATION.md`, `src/shared/` and `docs/API.md`):
  1. The engineer creates a project and invites people (requests 4 and 24).
  2. Supplier payments are owner-only, with owner-approved suppliers, an autopay mandate with caps,
     and release after the engineer's verification. Contractors never start or see them (requests
     16–18 and 25). Contractors still record **wage** payments.
  3. Engineer checklist edits, attendance fixes and medical expenses need a contractor vote, then a
     final owner decision. They are append-only (requests 20 and 23). This replaces the direct apply
     in request 8.
- **New requests:** 20–27 (table above). 22 and 24 build on `be/wage-payment-modes` and
  `be/project-invitations`, which are not merged yet.
- **Frontend plan:** these screens will be built on labelled mocks and stay **MOCKED** until the
  contract lands:
  - bug fix: the fix reason and delivery notes are shown;
  - required notes;
  - the payment form;
  - a live-camera-only capture;
  - the approval chain;
  - medical expenses;
  - engineer project setup and invites;
  - owner suppliers and autopay.
- **Needs from Codex first:** the `ChangeRequest` shape (request 20) and the wage payment schema (9
  and 22). Until they are published, the mocks use a frontend-only type.

### 2026-11-26 IST · Sign-in, photo upload, task workflow, checklist edits

- **Branch / commit:** `fe/contractor-screens` after PR #22 merged (follow-up PR; commits `a96565f`, `525689d`).
- **Done:**
  - **Multipart in `api()`:** a `FormData` body is sent as multipart (the browser sets the boundary).
  - **Sign-in** (`/login`): email and password through the Better Auth bridge
    (`POST /api/auth/sign-in/email`), then back to `/projects`. A 401 from any page links to it.
    Sign out sits in the project switcher. On demo data (mocks on) the page says there is nothing to
    sign in to and links to the demo projects. **IMPLEMENTED, not exercised**: no disposable database
    was started, so the live sign-in has not been run.
  - **Site photos** (contractor and engineer): Add photos on Site, and the Photo tile in the Log sheet.
    A note and 1 to 10 JPEG, PNG or WebP photos of up to 5 MB each, checked before sending.
    `POST /projects/:id/progress`.
  - **Task workflow, contractor:** Start (`POST /checklist-items/:id/start`) and Send proof
    (`POST /checklist-items/:id/completion`, note and photos). A sent-back task shows the engineer's
    reason. The task then shows "Waiting for check" until the engineer decides.
  - **Checklist edits, engineer:** add a task, rename it, remove it, each with a reason of at least
    10 characters (`POST /projects/:id/checklist-items`, `PATCH` and `DELETE /checklist-items/:id`).
    Tasks waiting for review cannot be edited.
- **Mocks:** `src/mocks/checklist-routes.ts` answers all of the above and refuses what the API refuses
  (409 for a task in the wrong state, 400 for a bad form, 403 for the wrong role). Demo uploads are not
  stored, so their photo URLs show the "Demo photo" tile.
- **Cleanup:** one `parseBody` and `mockId` for all mock routes, one `failIfInvalid` for all write hooks.
- **Tests:** lint, typecheck pass. `vitest run src`: 65 pass (new: task workflow, photo limits and
  roles, checklist add, rename and remove). Playwright at 390 px light and 1440 px dark: start a task,
  send proof (empty note and no photo are refused in words, a real file goes through), Photo tile opens
  the sheet, engineer adds a task (short reason refused). No overflow, no console errors.
- **Still needs the backend or a decision:** the delivery challan photo (the contract has no field for
  it); the anti-fraud and payments screens (requests 13 to 19, not authorised); team list and
  invitations (requests 4 and 12).
- **Review fixes (pr-review agent):** Accept is disabled until the proof photos can be shown, and a
  failed proof load says so; a failed sign-out shows a message; the mock Start only accepts a task
  that has not started, like the server; the hidden file input is out of the tab order; tests for the
  multipart and JSON transport and for sign-in and sign-out (stubbed `fetch`). 71 tests pass.
- **Next:** run the live sign-in and the screens against a disposable local database
  (`./start.sh --live`, once Codex lands the launcher), then switch the mocks off route by route.

### 2026-11-26 IST · Engineer side: Home, Review, verified checklist shape

- **Branch / commit:** `fe/contractor-screens` after PR #22 merged (follow-up PR; commits `a96565f`, `525689d`).
- **Found:** the live `GET /projects/:id/checklists` returns the M6 verified shape
  (`verificationStatus`, `removedAt`, `history`). The shared `ChecklistsResponse` is strict and would
  reject it, so the checklist reads now parse with `VerifiedChecklistsResponse`, and the demo mocks
  produce that shape. The Site page shows the five states (not started, under way, waiting for check,
  sent back, done) and hides soft-removed items. `src/lib/checklist.ts` derives the types because the
  contract exports the schemas without types (request to Codex: export them).
- **Done (MOCKED):**
  - **Engineer Home:** plan progress, tasks waiting for the engineer, tasks sent back, materials
    running low, recent activity. No money anywhere on it.
  - **Review** (centre button, and from Home): each waiting task shows the contractor's note and
    photos; Accept, or Send back with a reason of at least 10 characters. The mock refuses a send-back
    without a reason, a proof that is not the latest submission (409), a repeat decision (409) and a
    non-engineer (403), like the contract. Demo photos have no image files, so a tile says so.
  - Activity lines for accepted and sent-back tasks.
- **Tests:** lint, typecheck pass. `vitest run src`: 62 pass (new: accept, send-back refusals, role).
  Playwright on the engineer demo project at 390 px light and 1440 px dark: Home, Site, Stock and Logs
  have no overflow and no console errors; the review flow ran at 390 px (send back with a short reason
  is refused in plain words, a valid send-back and an accept each remove the card).
- **Not done:** the contractor side of M6 (start a task, submit completion with photos) needs multipart
  in `api()`; checklist add, rename and remove (request 8 UI) are not built.
- **Next:** multipart in `api()` (photo upload for deliveries, progress and task completion), then
  login so the mocks can be switched off.

### 2026-11-26 IST · Contractor screens: Today, Stock, Wages

- **Branch / commit:** `fe/contractor-screens`, with `main` merged in (M6: proposals, checklist
  verification, Windows launcher; no frontend files conflicted).
- **Done (all on mocks, MOCKED):**
  - **Today** (`/projects/[id]`, contractor): tabs Delivery, Usage, Attendance, driven by `?log=`
    so the centre Log sheet links straight to a tab. Each form shows the balance on site, checks blank
    fields with a plain sentence, and shows the API's own refusal (duplicate challan, not enough
    stock, attendance already saved). Attendance defaults everyone to Full and shows a count on the
    save button; a date that is already saved is locked, and a person is changed with Fix.
  - **Fix sheet** for stock entries, attendance and wage payments: new value plus a reason of at least
    10 characters. The value in force is the newest correction for that record, else the original.
  - **Stock** (contractor and engineer): per material, the balance, a low-stock flag and a 14-day area
    chart rebuilt from the movements.
  - **Wages**: range presets and date inputs, totals (earned, paid, advances, still due), per-worker
    rows with Pay, a Record payment sheet, and the range's payments with Fix.
- **Not done, needs the API:** the challan photo on a delivery and the Photo tile in the Log sheet
  need multipart in `api()`; both say so on screen. Payment reference rules per mode wait on request 9.
- **Files:** new `src/components/{forms.tsx,today/*,stock/*,wages/*}`; changed `project-home.tsx`,
  `action-sheet.tsx` and the stock and wages route pages.
- **Tests:**
  - `pnpm lint`, `pnpm typecheck`: pass. `vitest run src`: 59 pass (new: parsing, first-problem,
    effective value).
  - Playwright against `next dev` (mocks) at 390 px light and 1440 px dark: delivery saves and shows
    the new balance; blank field, duplicate challan, over-use (names the balance), short fix reason
    and a saved fix; payment recorded. No horizontal overflow, no console errors, nothing tappable
    under 40 px on Today, Stock and Wages.
- **Backend since the last entry:** M6 is merged (requests 7 and 8 are in the contract); requests 4,
  5, 6, 9, 11 to 19 are still open. Nothing here depends on them.
- **Next:** the engineer side (Review, checklist status, Stock, Logs without money), then wiring
  login so the mocks can be switched off.

### 2026-11-25 20:48 IST · Contractor groundwork, role badge, stock fix

- **Branch / commit:** `fe/contractor-screens`, stacked on `fe/owner-screens` (PR #18).
- **Done:**
  - Contractor write mocks (`src/mocks/write-routes.ts`) for deliveries, usages, attendance, wage
    payments and adjustments. They refuse what the API refuses:
    - `DUPLICATE_CHALLAN` (supplier and challan matched trimmed and case-insensitive)
    - `INSUFFICIENT_STOCK` with `details` naming the material and its balance
    - `CONFLICT` for attendance already saved for that day, and for a no-op fix
    - 400 for input that fails the shared schema
    - a fix that would overdraw stock
  - Mock errors now carry `details` like the real API.
  - Write hooks validate with the shared input schemas and refresh the project's data.
- **Fixed:** the demo stock balance counted a delivery fix twice (the corrected quantity and its
  compensating movement). The balance is now the plain sum of the append-only movements, and the
  corrected quantity is used only for cost.
- **Design (frontend developer):** the role (Owner, Contractor, Engineer) shows beside the logo on
  desktop and phone. The line under "Week N" on Home is now the sans font at a smaller size.
- **Tests:**
  - `pnpm lint`, `pnpm typecheck`: pass.
  - `vitest run src`: 46 pass. New: delivery adds to stock, a duplicate challan is refused, usage
    over stock is refused with the balance, attendance saves once per day, input is validated, and a
    delivery fix changes stock once and refuses a no-op.
  - Playwright owner Home at 390, 1024 and 1440 px: no overflow, no errors.
- **Next:** contractor UI (Today with Delivery, Usage and Attendance forms and fixes; Stock; Wages
  with record payment), then the engineer side.

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
