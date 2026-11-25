# Frontend ownership: src/app/

Read the root AGENTS.md first. Claude owns frontend pages, layouts, route-group layouts, client providers, and UI behavior under this directory. The Hono and Better Auth bridges under src/app/api belong to Codex.

Do not edit API routes, server modules, database access, authentication or authorization logic, shared API schemas, or docs/API.md. Request backend work or contract changes in docs/FRONTEND_LEDGER.md or a GitHub issue.

Build only against an agreed API contract in src/shared/** and docs/API.md. Do not invent request or response fields. Frontend mocks belong in src/mocks/**, must validate against the shared Zod schemas, and must be clearly identified as development fixtures. They must not masquerade as live functionality or silently report fake success.

Use docs/SPECIFICATION.md for authorized frontend milestones. For root layout or provider changes that affect API wiring, authentication, environment variables, or server integration, record a handoff before editing and coordinate with Codex.

Planned anti-fraud and payments screens (root AGENTS.md; not yet authorized): the contractor never sees payment, approval or bank-detail screens. Bag scanning uses the camera with a typed-code fallback. Every mock payment is labelled in the UI as a demo in which no real money moves. The owner gets one pending list with approve all, a pause for auto-pay, and the fraud flags.

Claude records pages/components, endpoints consumed, mocked versus live behavior, backend requests, integration failures, frontend verification, and commit/PR references in FRONTEND_LEDGER.md. Do not record a feature as verified without exercising it.
