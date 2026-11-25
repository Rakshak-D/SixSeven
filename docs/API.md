# API contract and route inventory

Codex is the sole writer of this file. The endpoint list below is inherited from the repository scaffold. The full official problem statement has not yet been supplied, so proposed roles, errors, and workflows are provisional and are not a frozen contract.

Contract availability, backend readiness, and frontend integration are independent statuses. A route name or mounted router does not mean the API is implemented. Before feature work, Codex publishes the approved method, path, authentication, authorization, request schema, response schema, and error behavior here and in the shared Zod/OpenAPI contract.

Status meanings:
- Contract: AVAILABLE means the current source exposes a usable schema; PARTIAL means only some contract material exists; DRAFT means a route proposal without complete schemas.
- Backend: IMPLEMENTED means a handler exists; verification is recorded separately. SCAFFOLD ONLY means an empty route module or placeholder.
- Frontend: NOT STARTED, MOCKED (explicit development fixture), IMPLEMENTED, VERIFIED, or INTEGRATED. INTEGRATED requires a live backend route and exercised frontend flow.

| Method + path | Authentication | Authorization in scaffold | Request schema | Response schema | Error behavior in scaffold | Contract | Backend readiness | Frontend integration |
|---|---|---|---|---|---|---|---|---|
| GET /health | Public | None | None | { ok: boolean, db: "up" or "down" } | A failed DB probe returns HTTP 200 with db=down; generic 404 for unknown routes | AVAILABLE (local route schema) | IMPLEMENTED; execution NOT_RUN in M0 | NOT STARTED |
| GET /doc | Public | None | None | Generated OpenAPI 3.0 document | Generic 404 for unknown routes | PARTIAL (document generated from registered handlers) | IMPLEMENTED; execution NOT_RUN in M0 | NOT STARTED |
| POST /projects | TBD | Proposed: contractor | TBD | TBD | Proposed 400 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects | TBD | Proposed: project members | None | TBD | Not specified | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id | TBD | Proposed: project members | None | TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/members | TBD | Proposed: contractor | TBD | TBD | Proposed 400, 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/materials | TBD | Proposed: contractor | TBD | TBD | Proposed 400, 403, 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/workers | TBD | Proposed: contractor | TBD | TBD | Proposed 400, 403, 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/deliveries | TBD | Proposed: contractor | TBD | TBD | Proposed 409 DUPLICATE_CHALLAN | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/usages | TBD | Proposed: contractor | TBD | TBD | Proposed 409 INSUFFICIENT_STOCK with balance | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/attendance | TBD | Proposed: contractor | Bulk date is a scaffold note; schema TBD | TBD | Proposed 400, 409 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/stock | TBD | Proposed: project members | None | Balance description only; schema TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/movements | TBD | Proposed: project members | None | History description only; schema TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/wage-payments | TBD | Proposed: contractor | TBD | TBD | Proposed 400, 403 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/adjustments | TBD | Proposed: contractor | Target, new value, and reason are scaffold notes; schema TBD | TBD | Proposed 400, 403 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/summary | TBD | Proposed: project members | None | Budget/spend description only; schema TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/wage-sheet | TBD | Proposed: owner or contractor | from, to, format query note; schema TBD | TBD | Proposed 403, 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/progress | TBD | Proposed: engineer or contractor | Multipart note/photo description; schema TBD | TBD | Proposed 400, 403 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/timeline | TBD | Proposed: project members | None | Photos-by-day description only; schema TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/proposals | TBD | Proposed: engineer or contractor | TBD | TBD | Proposed 400, 403 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /proposals/:id/decision | TBD | Proposed: owner | Approve/reject note; schema TBD | TBD | Proposed 403, 404, 409 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| GET /projects/:id/activity | TBD | Proposed: project members | None | Audit-log description only; schema TBD | Proposed 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |
| POST /projects/:id/checklists | TBD | Proposed: engineer | source query note; full request TBD | ChecklistDraft exists, direction and full response TBD | Proposed 400, 403 | PARTIAL (one shared draft schema) | SCAFFOLD ONLY (empty router) | NOT STARTED |
| PATCH /checklist-items/:id | TBD | Proposed: engineer | Status-only note; schema TBD | TBD | Proposed 400, 403, 404 | DRAFT | SCAFFOLD ONLY (empty router) | NOT STARTED |

The non-public auth and authorization entries above are proposals copied from the scaffold API table. No auth middleware is present and both Drizzle schema files are currently empty; do not represent those policies as implemented. The existing frontend ledger reports that no UI feature or endpoint integration has started.

A frontend endpoint or schema request is recorded by Claude in docs/FRONTEND_LEDGER.md or a GitHub issue. Codex evaluates the request, updates this canonical file and shared schemas, and coordinates a contract-only merge before dependent implementation. Mocks must validate against the agreed shared schemas and be labeled as development fixtures.
