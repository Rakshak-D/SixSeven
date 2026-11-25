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

All rows below have an available shared contract. The four project operations are verified in M2. The eight M3 operations for materials, workers, deliveries, usages, stock and movement history are verified by [PostgreSQL CI #19](https://github.com/Rakshak-D/SixSeven/actions/runs/45598875957). M4 attendance, wage payment, correction and wage-sheet handlers are implemented and verified by [PR #11 CI #29](https://github.com/Rakshak-D/SixSeven/actions/runs/45611095977), merged as [PR #11](https://github.com/Rakshak-D/SixSeven/pull/11), and verified on main by [CI #30](https://github.com/Rakshak-D/SixSeven/actions/runs/45611840467) at `c34eb6e`. Later operations remain planned. Each row assumes a valid session. Roles are scoped to the resource's project. “Members” means owner, contractor or engineer. Frontend integration is tracked separately in the frontend ledger.

| Priority | Method and path | Role | Query | Body | Success | Additional conflict behavior |
|---|---|---|---|---|---|---|
| P0 | POST /projects | Authenticated creator becomes contractor for this project | — | projects.CreateProjectInput | 201 projects.ProjectResponse | — |
| P0 | GET /projects | Authenticated, own memberships only | — | — | 200 projects.ProjectsResponse | — |
| P0 | GET /projects/:id | Members | — | — | 200 projects.ProjectResponse | — |
| P0 | POST /projects/:id/members | Contractor | — | projects.AddProjectMemberInput | 201 projects.ProjectMemberResponse | CONFLICT if already a member. Unknown account gives 404. |
| P0 | POST /projects/:id/materials | Contractor | — | materials.CreateMaterialInput | 201 materials.MaterialResponse | — |
| P0 | GET /projects/:id/materials | Members | — | — | 200 materials.MaterialsResponse | — |
| P0 | POST /projects/:id/workers | Contractor | — | workers.CreateWorkerInput | 201 workers.WorkerResponse | — |
| P0 | GET /projects/:id/workers | Owner, contractor | — | — | 200 workers.WorkersResponse | — |
| P0 | POST /projects/:id/deliveries | Contractor | — | deliveries.CreateDeliveryInput | 201 deliveries.DeliveryResponse | DUPLICATE_CHALLAN for the same supplier and challan in this project. CONFLICT if the resulting balance exceeds numeric(14,3). |
| P0 | POST /projects/:id/usages | Contractor | — | usages.CreateUsageInput | 201 usages.UsageResponse | INSUFFICIENT_STOCK with materialId and current balance in `InsufficientStockErrorResponse` |
| P0 | GET /projects/:id/stock | Members | — | — | 200 stock.StockResponse | — |
| P0 | GET /projects/:id/movements | Members | stock.StockMovementsQuery | — | 200 stock.StockMovementsResponse, newest first | — |
| P0 | POST /projects/:id/attendance | Contractor | — | attendance.CreateAttendanceInput | 201 attendance.AttendanceResponse | CONFLICT for existing worker/date; entire batch rolls back |
| P0 | GET /projects/:id/attendance | Owner, contractor | attendance.AttendanceListQuery | — | 200 attendance.AttendanceListResponse | — |
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
| P2 | GET /projects/:id/checklists | Members | — | — | 200 checklist.ChecklistsResponse | — |
| P2 | PATCH /checklist-items/:id | Engineer | — | checklist.UpdateChecklistItemInput | 200 checklist.ChecklistItemResponse | — |

## Operation details

- A member invite links an existing account by email. No email delivery or invitation redemption flow. Worker list includes active status; attendance accepts only active workers. Duplicate worker IDs within the submitted attendance array are a 400. Rate snapshots come from the server.
- Attendance and payment list date filters are inclusive and apply to the original work or payment date. Adjustment list dates filter the correction's creation date in IST. The optional target type and target ID filters narrow correction history. Results are newest first with a stable tie-breaker. Attendance and payment list records contain both the original and effective values. Adjustment records carry the prior and replacement values, reason and session-derived actor ID.
- Materials start at zero stock. Delivery and usage requests and responses use positive amounts. Usage is negative in movement history. Delivery supplier/challan matching is trimmed and case-insensitive within the project. The guarded stock update, signed movement and audit event commit together. The maximum balance is 99,999,999,999.999.
- Low stock means balance is less than or equal to the threshold. Movement history orders by occurrence date, creation time and ID, all descending. A movement filter for a missing or out-of-project material returns 404.
- Corrections accept an absolute replacement magnitude for an original delivery/usage, new half-day units for attendance, or a replacement positive payment amount. A zero replacement stock quantity reverses that movement. The server preserves movement direction, applies exact thousandth deltas through the stock ledger, and derives prior value and actor from stored records and the session. Corrections are serialized per original record and ordered by a database identity sequence; adjustment history is returned newest first by that sequence. No-op corrections return 409 CONFLICT. Correction and audit records are append-only; the audit payload carries the corrected target type and ID. No client-supplied actor is accepted.
- The wage sheet uses inclusive IST dates for work and payments and a repeatable-read database snapshot. JSON is default. CSV/PDF use `WageExportContentType` and Content-Disposition attachment. CSV amount columns use integer paise and formula-like text cells are neutralized. PDF amounts use `INR` text to avoid font-dependent rupee glyphs. The shared calculation returns exact accrued wages, paid wages, advances and signed due; a negative due is an overpayment. Engineer access to these worker-level endpoints and exports is denied.
- Progress is multipart with `note`, optional `checklistItemId`, and 1–10 repeated `photos` file parts. JPEG, PNG and WebP only, max 5,000,000 bytes each. Verify declared MIME against decoded image content. Until checklist runtime is implemented in M6, a non-null `checklistItemId` is rejected. `takenOn` is the server-recorded IST upload date; EXIF is not exposed. Return metadata and a project-scoped URL, never a local path or storage key. The current JSON API client is suitable for JSON calls; multipart, downloads and auth require their respective transport.
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
{"role":"engineer","budgetPaise":250000000,"spendPaise":4180000,"burnRatePaisePerDay":209000,"materialVariance":[],"stockAlerts":[]}
```
