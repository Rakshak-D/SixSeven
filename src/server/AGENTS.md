# Backend and API ownership: src/server/

Codex owns this directory, including route modules, middleware, services, server-side authentication/authorization, OpenAPI wiring, and AI integrations. Codex also owns the bridge at src/app/api/[[...route]]/route.ts. Read root AGENTS.md, docs/API.md, PROJECT_LEDGER.md, and BACKEND_LEDGER.md before work.

The current Hono app is mounted at /api/v1. Route files and imports may be scaffolding only. Confirm behavior in source and tests; a mounted empty router is not an implemented endpoint.

Before implementing an endpoint, agree the contract first in src/shared/** and docs/API.md: method, path, authentication, authorization, request/response schemas, and error behavior. Use the standard error shape only where the implementation confirms it. Keep business logic in server-side services and database operations behind the appropriate integrity rules. Do not add routes or features before the technical lead supplies the full requirements and authorizes a milestone.

Backend tests and API integration tests belong to Codex. Use only a disposable project-local database; inspect DATABASE_URL before commands and never target production or another contributor's database. Do not disable or skip checks to hide failures.
