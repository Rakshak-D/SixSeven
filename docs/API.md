# Slate API contract

[Specification](SPECIFICATION.md) defines the approved domain rules. Schema names below are exports from `src/shared/schemas/<module>.ts` unless noted. Each domain path is relative to `/api/v1`. Contract availability, backend readiness and frontend integration are tracked separately. `GET /api/v1/doc` describes registered routes, including projects and the M3 inventory and stock operations.

## Conventions

- Use JSON and same-origin session cookies unless the table specifies multipart or a binary response. An em dash means no input of that kind. `:id` uses `common.IdParams`. It is a project ID after `/projects/` and the resource ID after `/proposals/` or `/checklist-items/`. IDs are opaque strings. `PhotoParams` covers the two photo path parameters.
- Money is safe integer paise. Quantities are JSON numbers with up to three fractional digits, in range for PostgreSQL numeric(14,3). Compute with exact database decimals or integer thousandths, not binary floating-point arithmetic. Calendar dates use YYYY-MM-DD and site dates use IST. Timestamps use UTC ISO 8601 with milliseconds.
- Protected domain operations use `ErrorResponse` from `src/shared/errors.ts`. Shared failures are 400 `VALIDATION_ERROR` for invalid input, 401 `UNAUTHENTICATED` for no valid session, 403 `FORBIDDEN` for a member with insufficient permission, 404 `NOT_FOUND` for missing or out-of-scope resources, and 500 `INTERNAL` for unexpected errors. Check project membership before role restrictions. The table adds operation-specific 409 failures. Session checks and actor attribution are server-side.
- Successful creates return 201. Lists return arrays and use an empty array for no results. Nullable response fields are explicit. Body and response schemas define required fields, allowed values and constraints.

## Public scaffold endpoints

| Method and path | Params, query, body | Response | Contract | Backend | Frontend |
|---|---|---|---|---|---|
| GET /health | — | 200 JSON `{ ok: boolean, db: "up" or "down" }`; a failed DB probe gives `db: "down"` | Available in route schema | Implemented | No integration in M1 |
| GET /doc | — | 200 OpenAPI 3.0 JSON | Available for registered routes | Implemented | No integration in M1 |

## Authentication (P0)

Slate's Next.js bridge serves these Better Auth 1.7.27 email/password routes at `/api/auth`, separate from Hono. Sign-in uses same-origin JSON. The bridge validates bodies and returns only fields in the published success schemas while preserving the native status and all Set-Cookie headers. Session transport uses the signed cookie. Use cookie-aware fetch with credentials included. The bridge exposes the three operations below.

| Method and full path | Access | Body → success | Error behavior |
|---|---|---|---|
| POST /api/auth/sign-in/email | Public | `SignInInput` → 200 `SignInResponse` | 400 invalid email/input; 401 invalid credentials; 403 if an auth policy blocks login |
| POST /api/auth/sign-out | Public and idempotent for missing session | No body or `SignOutInput` → 200 `SignOutResponse` | 403 on rejected origin; unexpected failures use native errors |
| GET /api/auth/get-session | Public | — → 200 `SessionResponse`, null if absent or expired | Unexpected auth failures use native errors |

Auth errors use the top-level `message` and optional `code` parsed by `AuthErrorResponse`. The bridge preserves native credential and origin errors. Cookies are signed and HTTP-only, and production requires HTTPS with secure cookies. Sessions live in PostgreSQL and expire after seven days, with native refresh eligibility after one day. Sign-out checks that the old session is unusable before returning success. Auth responses use private, no-store caching. GET /api/v1/projects discovers the authenticated user's memberships and roles.

The development seed provisions synthetic `DemoAccountEmail` entries with corresponding project roles. Demo login uses ordinary email sign-in. See [development setup](devops.md) for the disposable database and local password configuration. Contract: available. Backend: implemented, with PostgreSQL integration tests. Frontend: no integration delivered in M2.

## Domain operations

All rows below have an available shared contract. The four project operations are verified in M2. The eight M3 operations for materials, workers, deliveries, usages, stock and movement history are verified by [PostgreSQL CI #19](https://github.com/Rakshak-D/SixSeven/actions/runs/45598875957). M4 attendance, wage payment, correction and wage-sheet handlers are implemented and verified by [PR #11 CI #29](https://github.com/Rakshak-D/SixSeven/actions/runs/45611095977), merged as [PR #11](https://github.com/Rakshak-D/SixSeven/pull/11), and verified on main by [CI #30](https://github.com/Rakshak-D/SixSeven/actions/runs/45611840467) at `c34eb6e`. M5 summary, progress, timeline, protected photo and activity handlers are implemented and verified by [PR #14 CI #49](https://github.com/Rakshak-D/SixSeven/actions/runs/45641035558), merged as [PR #14](https://github.com/Rakshak-D/SixSeven/pull/14), and verified on main by [CI #50](https://github.com/Rakshak-D/SixSeven/actions/runs/45641473492) at `1a81e78`. Each row assumes a valid session. Roles are scoped to the resource's project. “Members” means owner, contractor or engineer. Frontend integration is tracked separately in the frontend ledger.

| Priority | Method and path | Role | Query | Body | Success | Additional conflict behavior |
|---|---|---|---|---|---|---|
| P0 | POST /projects | Authenticated creator becomes engineer for this project | — | projects.CreateProjectInput | 201 projects.ProjectResponse | — |
| P0 | GET /projects | Authenticated, own memberships only | — | — | 200 projects.ProjectsResponse | — |
| P0 | GET /projects/:id | Members | — | — | 200 projects.ProjectResponse | — |
| P0 | POST /projects/:id/members | Contractor on a legacy contractor-created project | — | projects.AddProjectMemberInput | 201 projects.ProjectMemberResponse | CONFLICT if already a member. Unknown account gives 404. |
| P0 | POST /projects/:id/invitations | Engineer | — | projects.CreateProjectInvitationInput | 201 projects.ProjectInvitationResponse | 409 for an existing member or invitation |
| P0 | GET /projects/:id/invitations | Engineer | projects.ProjectInvitationQuery | — | 200 projects.ProjectInvitationsResponse | — |
| P0 | GET /invitations | Authenticated recipient | — | — | 200 projects.ProjectInvitationsResponse | — |
| P0 | POST /invitations/:id/accept | Authenticated recipient | — | — | 200 projects.ProjectMemberResponse | 404 for another recipient's invitation, 409 if accepted or already a member |
| P0 | GET /projects/:id/members | Members | — | — | 200 projects.ProjectTeamResponse | 404 for nonmembers |
| P0 | PATCH /me | Authenticated caller | — | projects.UpdateMyPhoneInput | 200 projects.MyPhoneResponse | 400 for invalid numbers |
| P0 | POST /projects/:id/materials | Contractor | — | materials.CreateMaterialInput | 201 materials.MaterialResponse | — |
| P0 | GET /projects/:id/materials | Members | — | — | 200 materials.MaterialsResponse | — |
| P0 | POST /projects/:id/workers | Contractor | — | workers.CreateWorkerInput | 201 workers.WorkerResponse | — |
| P0 | GET /projects/:id/workers | Owner, contractor | — | — | 200 workers.WorkersResponse | — |
| P0 | POST /projects/:id/workers/:workerId/deactivate | Contractor | workers.WorkerParams | workers.DeactivateWorkerInput | 200 workers.WorkerResponse | 409 CONFLICT for an inactive worker |
| P0 | POST /projects/:id/deliveries | Contractor | — | deliveries.CreateDeliveryInput | 201 deliveries.DeliveryResponse | DUPLICATE_CHALLAN for the same supplier and challan in this project. CONFLICT if the resulting balance exceeds numeric(14,3). |
| P0 | POST /projects/:id/expected-deliveries | Contractor, engineer | — | deliveries.CreateExpectedDeliveryInput | 201 deliveries.ExpectedDeliveryResponse | 404 for unknown project material |
| P0 | GET /projects/:id/expected-deliveries | Members | deliveries.ExpectedDeliveriesQuery | — | 200 deliveries.ExpectedDeliveriesResponse | — |
| P0 | POST /expected-deliveries/:id/accept | Contractor | — | deliveries.CreateDeliveryInput | 201 deliveries.DeliveryResponse | DUPLICATE_CHALLAN, CONFLICT if already decided or stock capacity exceeded |
| P0 | POST /expected-deliveries/:id/reject | Contractor | — | deliveries.RejectExpectedDeliveryInput | 200 deliveries.ExpectedDeliveryResponse | CONFLICT if already decided |
| P0 | POST /projects/:id/deliveries/:deliveryId/challan-photo | Contractor | — | multipart `photo` and `capturedAt` | 201 deliveries.ChallanPhotoResponse | CONFLICT if attached, 413 if request too large |
| P0 | GET /projects/:id/deliveries/:deliveryId/challan-photo | Members | — | — | 200 private JPEG, PNG or WebP | 404 if the photo is absent or inaccessible |
| P0 | POST /projects/:id/usages | Contractor | — | usages.CreateUsageInput | 201 usages.UsageResponse | INSUFFICIENT_STOCK with materialId and current balance in `InsufficientStockErrorResponse` |
| P0 | GET /projects/:id/stock | Members | — | — | 200 stock.StockResponse | — |
| P0 | GET /projects/:id/movements | Members | stock.StockMovementsQuery | — | 200 stock.StockMovementsResponse, newest first | — |
| P0 | POST /projects/:id/attendance | Contractor | — | attendance.CreateAttendanceInput | 201 attendance.AttendanceResponse | CONFLICT for existing worker/date; entire batch rolls back |
| P0 | GET /projects/:id/attendance | Owner, contractor | attendance.AttendanceListQuery | — | 200 attendance.AttendanceListResponse | — |
| P0 | GET /projects/:id/attendance/roster | Members | attendance.AttendanceListQuery | — | 200 attendance.AttendanceRosterResponse | — |
| P1 | POST /projects/:id/wage-payments | Contractor | — | wages.CreateWagePaymentInput | 201 wages.WagePaymentResponse | — |
| P1 | GET /projects/:id/wage-payments | Owner, contractor | wages.WagePaymentListQuery | — | 200 wages.WagePaymentListResponse | — |
| P1 | POST /projects/:id/adjustments | Contractor | — | adjustments.CreateAdjustmentInput | 201 adjustments.AdjustmentResponse | INSUFFICIENT_STOCK for a compensating move that would overdraw |
| P1 | GET /projects/:id/adjustments | Owner, contractor | adjustments.AdjustmentListQuery | — | 200 adjustments.AdjustmentListResponse | — |
| P1 | GET /projects/:id/summary | Members | — | — | 200 summary.SummaryResponse | — |
| P1 | GET /projects/:id/wage-sheet | Owner, contractor | wages.WageSheetQuery | — | 200 wages.WageSheetResponse, or CSV/PDF attachment | — |
| P1 | POST /projects/:id/progress | Engineer, contractor | — | progress.CreateProgressInput (multipart) | 201 progress.ProgressResponse | — |
| P1 | GET /projects/:id/timeline | Members | — | — | 200 progress.TimelineResponse, IST days newest first | — |
| P1 | GET /projects/:id/photos/:photoId | Members | — | — | 200 protected image bytes with progress.PhotoMime content type | — |
| P1 | GET /projects/:id/activity | Members | — | — | 200 activity.ActivityResponse, newest first | — |
| P2 | POST /projects/:id/proposals | Engineer, contractor | — | proposals.CreateProposalInput | 201 proposals.ProposalResponse | — |
| P2 | GET /projects/:id/proposals | Members | — | — | 200 proposals.ProposalsResponse, newest first | — |
| P2 | POST /proposals/:id/decision | Owner | — | proposals.DecideProposalInput | 200 proposals.ProposalResponse | CONFLICT if already decided |
| P2 | POST /projects/:id/checklists | Engineer | checklist.ChecklistDraftQuery | checklist.CreateChecklistDraftInput | 200 checklist.ChecklistDraftResponse | — |
| P2 | POST /projects/:id/checklists/records | Engineer | — | checklist.SaveChecklistInput | 201 checklist.ChecklistResponse | CONFLICT if draft reference was already used |
| P2 | GET /projects/:id/checklists | Members | — | — | 200 checklist.VerifiedChecklistsResponse | — |
| P2 | PATCH /checklist-items/:id | Engineer | — | checklist.RenameChecklistItemInput | 200 checklist.VerifiedChecklistItemResponse | CONFLICT if removed, awaiting review, or unchanged |

## Operation details

- Creating a project assigns the caller the engineer role for that project. The engineer creates owner or contractor invitations by email. Invitations are in-app records and can be accepted after signing in with the intended email. Acceptance consumes the invitation and grants membership in one transaction. Legacy contractor-created projects keep their existing memberships and direct enrollment route. Worker list includes active status; attendance accepts only active workers. Duplicate worker IDs within the submitted attendance array are a 400. Rate snapshots come from the server. Use the attendance roster for the engineer's dated log. It returns record ID, worker ID, worker name, work date and effective half-day units after corrections. It applies the same inclusive date and optional worker filters as the financial attendance read. The financial route still returns 403 for engineers.
- Engineers may supply exactly one of `email` or `phone` and filter the project invitation list by `pending` or `accepted`. Phone numbers normalize to `+91` and remain pending until verified-phone authentication is available. Self-entered team contact numbers confer no ownership proof. Phone invitations cannot be listed or redeemed by recipients in this release.
- In `PATCH /me`, submit a 10-digit Indian mobile number beginning with 6–9, optionally prefixed with `+91`. The server stores and returns the canonical `+91` form. Send `{"phone":null}` to stop sharing. The team list includes user ID, role, name and phone when set. Phone numbers are only available to the account owner and members of the same project.
- Attendance and payment list date filters are inclusive and apply to the original work or payment date. Adjustment list dates filter the correction's creation date in IST. The optional target type and target ID filters narrow correction history. Results are newest first with a stable tie-breaker. Attendance and payment list records contain both the original and effective values. Adjustment records carry the prior and replacement values, reason and session-derived actor ID.
- Materials start at zero stock. Delivery and usage requests and responses use positive amounts. Usage is negative in movement history. Delivery supplier/challan matching is trimmed and case-insensitive within the project. The guarded stock update, signed movement and audit event commit together. The maximum balance is 99,999,999,999.999.
- Expected delivery lists default to `pending`. Use `status=all`, `accepted` or `rejected` to read history. Acceptance uses the same material and the actual delivery quantity, cost, supplier and challan. Acceptance writes the delivery and audit in one transaction. Rejection records its reason, writes an activity event and leaves stock unchanged. A `newDate` after the original expected date creates a new pending schedule and leaves the rejected record in history.
- Upload one challan photo to an existing delivery using multipart `photo` and `capturedAt` fields. Omit the manual Content-Type header when sending browser FormData. JPEG, PNG and WebP are accepted up to 5,000,000 bytes, with the same decoded image validation as progress photos. Photos are private and project-scoped. If an upload fails, the delivery stays recorded and the upload can be retried. Successful attachments cannot be replaced. A missing attachment returns 404. Photo bytes cannot be cached by shared clients.
- Low stock means balance is less than or equal to the threshold. Movement history orders by occurrence date, creation time and ID, all descending. A movement filter for a missing or out-of-project material returns 404.
- Corrections accept an absolute replacement magnitude for an original delivery/usage, new half-day units for attendance, or a replacement positive payment amount. A zero replacement stock quantity reverses that movement. The server preserves movement direction, applies exact thousandth deltas through the stock ledger, and derives prior value and actor from stored records and the session. Corrections are serialized per original record and ordered by a database identity sequence; adjustment history is returned newest first by that sequence. No-op corrections return 409 CONFLICT. Correction and audit records are append-only; the audit payload carries the corrected target type and ID. No client-supplied actor is accepted.
- New wage payments accept `cash` (omit reference), `upi` (12 digits), `bank` (6–22 ASCII letters or digits), and `cheque` (6 digits). Every new payment requires a nonblank note. Send numeric references as text to preserve leading zeroes. Historical notes may be null. A missing or invalid required reference returns 400. Reads continue returning historical reference values as recorded.
- The wage sheet uses inclusive IST dates for work and payments and a repeatable-read database snapshot. JSON is default. CSV/PDF use `WageExportContentType` and Content-Disposition attachment. CSV amount columns use integer paise and formula-like text cells are neutralized. PDF amounts use `INR` text to avoid font-dependent rupee glyphs. The shared calculation returns exact accrued wages, paid wages, advances and signed due; a negative due is an overpayment. Engineer access to these worker-level endpoints and exports is denied.
- `SummaryResponse.spendByWeek` is an additive IST calendar-week series (Monday `weekStart`). Owners and contractors receive `materialsPaise`, `wagesPaise` (accrued wages), and `otherPaise`; engineers receive aggregate `spendPaise` only. Contract: available. Backend: implemented and verified by PR #14 CI #49 and main CI #50. Frontend: no integration verified. Weekly entries use the original delivery, work, or expense date and the same effective-correction rules as the summary.
- Project summaries cover the inclusive project `startDate` through the current IST calendar date. Future-dated deliveries, work and expenses are excluded from period expenditure and consumption until their site date arrives; current stock alerts reflect the persisted guarded balance for accepted mutations. A future-start project has zero spend and uses the one-day minimum denominator. Weekly output includes every IST calendar week from the Monday of `startDate` through today's Monday and reconciles with the summary totals. Material delivery lines use the latest effective original delivery quantity multiplied by its recorded unit price; checked BigInt arithmetic uses thousandths and rounds each positive line to whole paise before aggregation, with half-paise values rounded up (half away from zero). Labour is accrued wages only; payments and advances are not expenditure. Usage variance sums effective original usage magnitudes with exact thousandth quantities, not compensating stock movements. A zero planned quantity is exceeded by any positive use. Material tolerance is `plannedQty × (100 + tolerancePct) / 100`, with equality considered within tolerance; low stock uses the inclusive `balance <= lowStockQty` boundary. Engineers receive aggregate spend without a breakdown; other visible information can still permit indirect inference. Expenses are persisted for reporting, but this milestone adds no expense-management API. No expense rows contribute zero.
- Progress is multipart with `note`, optional `checklistItemId`, and 1–10 repeated `photos` file parts paired with repeated ISO `capturedAt` parts in matching order. JPEG, PNG and WebP only, max 5,000,000 bytes each and a 51,000,000-byte request limit. Verify declared MIME against fully decoded image content, reject animated/multipage images and cap decoded pixels. Files use generated opaque storage keys under private project-local `.cache/uploads` by default; `UPLOAD_DIR` may select another project-local directory. A checklist link must reference an active item in the same project. Linking ordinary progress does not submit a task for review. `takenOn` is the IST capture date for new records and the original date for historical photos; EXIF is not exposed. Return metadata and project-scoped URLs, never a local path or storage key. Failed database writes remove files created by that request. A process crash after file promotion and before transaction commit can leave an orphan; filesystem and PostgreSQL do not share a distributed transaction. The JSON API client is suitable for JSON calls; multipart, downloads and auth require their respective transport.
- Timeline records are grouped by IST day and ordered newest first with stable IDs. Photo reads require project membership and return private, non-cacheable image bytes with `nosniff`; missing files and inaccessible photo IDs both return 404. Activity returns allowlisted audit identifiers and actor names, never raw payloads. It hides attendance, wage payment and their corrections from engineers using the persisted correction target type. A stock correction appears once through its correction event; its separate compensating-movement audit row is suppressed. Contract: available. Backend: implemented and verified by PR #14 CI #49 and main CI #50. Frontend: no integration verified.
- Checklist generation accepts JSON house details, or multipart with optional `plan` image and the same scalar fields. Decode multipart numeric fields before schema validation. Template requests may send an empty JSON object. Validate combined query and body with `ChecklistDraftRequest`. AI accepts a plan or all of houseType, floors and rooms. The template is used when AI is unavailable, times out or returns invalid output. `source` reports the actual draft origin. Draft creation publishes no checklist records. An authenticated engineer edits and submits a separate save. The opaque draft reference must be bound to the project and engineer, with its source resolved server-side. No provider is configured in M1.

## Validated examples

CreateDeliveryInput
```json
{"materialId":"mat-cement","qty":60.125,"unitCostPaise":41500,"supplier":"Metro Building Supply","challanNo":"CH-1024","occurredOn":"2026-11-25"}
```

DeliveryResponse
```json
{"id":"mov-104","materialId":"mat-cement","qty":60.125,"unitCostPaise":41500,"supplier":"Metro Building Supply","challanNo":"CH-1024","occurredOn":"2026-11-25","note":null,"balance":84.625}
```

CreateAttendanceInput
```json
{"workDate":"2026-11-25","entries":[{"workerId":"worker-42","halfDays":1}]}
```

InsufficientStockErrorResponse
```json
{"error":{"code":"INSUFFICIENT_STOCK","message":"Only 12.500 bags available","details":{"materialId":"mat-cement","balance":12.5}}}
```

SummaryResponse
```json
{"role":"engineer","budgetPaise":250000000,"spendPaise":4180000,"burnRatePaisePerDay":209000,"materialVariance":[],"stockAlerts":[],"spendByWeek":[{"weekStart":"2026-11-23","spendPaise":4180000}]}
```

### M6 verification contract

All routes require a session. Item IDs resolve to their project before checking role. Inaccessible resources return 404, an insufficient project role returns 403, invalid input returns 400, and invalid state or a repeated decision returns 409.

| Method and path | Role | Input | Result |
|---|---|---|---|
| POST /checklist-items/:id/start | Contractor | No body | 200 VerifiedChecklistItemResponse |
| POST /checklist-items/:id/completion | Contractor | Multipart note and 1–10 photos, each paired with a `capturedAt` part, using progress upload limits | 200 VerifiedChecklistItemResponse |
| POST /checklist-items/:id/review | Engineer | ReviewChecklistItemInput with the latest submitted progressId | 200 VerifiedChecklistItemResponse |
| POST /projects/:id/checklist-items | Engineer | AddChecklistItemInput with the target checklist ID | 201 VerifiedChecklistItemResponse |
| PATCH /checklist-items/:id | Engineer | RenameChecklistItemInput | 200 VerifiedChecklistItemResponse |
| DELETE /checklist-items/:id | Engineer | RemoveChecklistItemInput | 200 VerifiedChecklistItemResponse |

Checklist reads and saves retain the legacy display status and add verificationStatus, removedAt and history to items. Clients use verificationStatus for todo, doing, waiting, done and sent_back. Filter removed items using removedAt. History links submission evidence to progress IDs in the project timeline. The live PATCH accepts rename input only. The legacy status-write schema remains exported for existing development fixtures.

Checklist drafts return source template. An AI request satisfying the existing input contract receives the deterministic template with fallbackReason unavailable. This milestone selects no provider and requires no AI credentials. Proposal and checklist handlers are implemented in M6. A checklist can hold forty historical items, including soft removals. Drafts can be saved once, by their creating engineer. Proposals record one owner decision without changing budget or creating a payment.
## Delivery verification and bag usage

| Operation | Role | Input | Success |
| --- | --- | --- | --- |
| GET /projects/:id/deliveries-to-verify | Engineer | Project ID | 200 `DeliveryVerificationQueue`, without prices |
| POST /projects/:id/deliveries/:deliveryId/verify | Engineer | `VerifyDeliveryInput` | 200 `DeliveryVerificationResponse` |
| POST /deliveries/:id/bag-codes | Engineer | `RegisterBagCodesInput` | 200 `DeliveryVerificationResponse` |

Set `tracksBags: true` when creating a material to require whole-bag deliveries and one registered code per used bag. Existing materials and bulk quantities retain their original quantity workflows. Supply `bagCodes` on a tracked usage. Codes are trimmed and case-sensitive, unique within a project. A 409 with `BAG_CODE_UNKNOWN`, `BAG_CODE_USED`, or `BAG_CODE_WRONG_MATERIAL` identifies the failed constraint. Wrong counts and duplicate codes in one input return 400. Codes and usage movements commit together. A tracked or verified movement cannot be corrected using a quantity-only stock adjustment. A delivery recorded by accepting an expected arrival enters the same verification queue. Members can access the delivery's existing protected challan photo where present. Verification attests to the engineer's record of issued identifiers. It does not establish the physical material's authenticity.

## Change requests

The shared schemas and inferred types are available in `src/shared/schemas/change-requests.ts`. The JSON routes cover checklist and attendance changes. Medical expense requests use the multipart route below. Use a note of at least ten characters when submitting a checklist or attendance request. Frontend integration is tracked separately.

| Method and path | Caller | Input | Success |
| --- | --- | --- | --- |
| POST /projects/:id/change-requests | Engineer for checklist edits and attendance fixes, contractor for attendance fixes | `CreateChangeRequestInput` | 201 `ChangeRequestResponse` |
| GET /projects/:id/change-requests | Project members, subject to sensitive-record visibility | `ChangeRequestsQuery` with optional `status` | 200 `ChangeRequestsResponse` |
| POST /change-requests/:id/vote | Contractor in the project | `VoteChangeRequestInput` | 200 `ChangeRequestResponse` |
| POST /change-requests/:id/reopen | Original author | `ReopenChangeRequestInput` | 200 `ChangeRequestResponse` |
| POST /change-requests/:id/decision | Owner in the project | `DecideChangeRequestInput` | 200 `ChangeRequestResponse` |
| POST /projects/:id/medical-expenses | Engineer or contractor in the project | Multipart `MedicalExpenseFields` plus 1–3 `billPhotos` and one ISO `capturedAt` part per photo, in matching order | 201 `ChangeRequestResponse` |
| GET /projects/:id/medical-expenses/:requestId/photos/:photoId | Author, contractor and owner in the project | Path parameters | 200 private JPEG, PNG or WebP bytes |

All writes require a nonblank `note`. The server derives the actor and role from the session and membership. Errors use the existing envelope: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, and 409 `CONFLICT` for invalid state, stale targets or duplicate decisions. Medical uploads also support 413 for oversized requests.

Engineer requests start at `pending_contractor`. The contractor advances them to `pending_owner` or marks them `rejected_contractor`. Only the author can reopen a contractor-rejected request. Contractor-authored requests start at `pending_owner`. The owner accepts and applies the change in the same transaction or marks it `rejected_owner`. Owner outcomes are final. Rejected requests are excluded from the pending owner queue. Task proof and its engineer review remain separate.

An attendance target ID references the attendance row. Actual half-days and paid entitlement are separate, and only a medical emergency allows a full-day pay override. Medical approval requires `payPaise` between 1 and the bill amount. Other decisions reject that field. Accepted medical requests identify `reimbursementProvider: "mock"`; no money moves. The expense is counted once on the incident date. Medical records and receipts are restricted to the author and the authorized contractor and owner reviewers. The server stores the capture and receipt times and allows up to ten minutes of age and 30 seconds of forward clock skew. A client timestamp does not authenticate camera provenance.

## Steel-marking evidence

Checklist creation and approved checklist additions may set `requiresSteelProof: true`. The existing review operation returns 409 `STEEL_PROOF_REQUIRED` if an engineer accepts a flagged item without evidence attached to the current contractor submission. Send-back remains available. A resubmission gets a new progress ID and requires a new set of evidence.

| Operation | Role | Request and response |
|---|---|---|
| POST /checklist-items/:id/steel-proof | Engineer | Multipart `progressId`, `note`, one to three `photos` and exactly one ISO `capturedAt` per image in order. Returns 201 `SteelProofPhotos`. |
| GET /checklist-items/:id/steel-proof | Members | Returns 200 `SteelProofPhotos`, including the progress ID for each photo. |
| GET /checklist-items/:id/steel-proof/:photoId | Members | Protected JPEG, PNG or WebP with private, no-store caching. |

Maximum 5,000,000 bytes per image. Captures more than ten minutes old or more than 30 seconds in the future are rejected. An item can have one upload per submission. Previous evidence remains readable. The server records receipt independently of the client timestamp. The upload records visual evidence and its submitting engineer. It cannot authenticate steel quality.

## Supplier orders and mock payments

All operations in this section require owner membership in the resource's project. Cross-project resources return 404. Shared contracts are in `supplier-payments.ts`. The backend is implemented. The frontend still requires live API wiring.

| Operation | Body or query | Response |
|---|---|---|
| GET /projects/:id/suppliers | None | 200 `SuppliersResponse` |
| POST /projects/:id/suppliers | `CreateSupplierInput` | 201 `SupplierWriteResponse` |
| POST /suppliers/:id/approve | `SupplierNoteInput` | 200 `SupplierWriteResponse` |
| POST /suppliers/:id/bank-change | `ChangeSupplierBankInput` | 200 `SupplierWriteResponse` |
| POST /suppliers/:id/bank-change/approve | `SupplierNoteInput` | 200 `SupplierWriteResponse` |
| PUT /suppliers/:id/autopay | `SetSupplierAutopayInput` | 200 `SupplierWriteResponse` |
| PUT /projects/:id/autopay | `PauseSupplierPaymentsInput` | 200 `SupplierWriteResponse` |
| POST /projects/:id/orders | `CreateSupplierOrderInput` | 201 `SupplierWriteResponse` |
| GET /projects/:id/supplier-payments | `SupplierPaymentsQuery` | 200 `SupplierPaymentsOverview` |
| GET /projects/:id/payments | `SupplierPaymentsQuery` | 200 `SupplierPaymentsResponse` |
| POST /supplier-payments/:id/decision | `DecideSupplierPaymentInput` | 200 `SupplierWriteResponse` |
| POST /payments/approve | `ApproveSupplierPaymentsInput` | 200 `SupplierWriteResponse` |

Use synthetic bank identifiers. The backend stores masked bank data only. A change needs explicit owner confirmation and a 24-hour cooldown. Pending and cooling-down changes hold release. Both release paths require a verified delivery covered in full by a single approved supplier order for the same material. Enabled mandates enforce per-bill and cumulative Monday-to-Sunday IST limits. Pause disables automatic releases while preserving deliberate owner decisions within applicable caps. Conflict (409) covers ineligible or already-decided requests. Batch approval is atomic. The amount uses exact quantity × price with half-up rounding to whole paise. The receipt's `provider` is always `mock`.

The owner summary may include `fraudFlags` with the detected condition, description and source ID. Rules are deterministic signals for owner review and are not proof of fraud.
