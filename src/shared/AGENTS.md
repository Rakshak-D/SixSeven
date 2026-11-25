# Shared frontend-safe API contract: src/shared/

Codex exclusively owns exported API schemas, shared error contracts, and shared domain types here. Claude consumes these files but does not create competing client-side or server-side definitions.

Keep browser-imported modules free of database drivers, Hono, Node-only modules, secrets, and server-only imports. Define request and response schemas from the approved specification; do not infer them from placeholder route names or old scaffold plans.

Before dependent frontend or backend work begins, publish and integrate contract changes in src/shared/** and docs/API.md. Breaking changes require an explicit handoff recorded in FRONTEND_LEDGER.md or a GitHub issue, then a contract-only PR. After integration, each owner updates its own lane.

Planned anti-fraud and payments contracts (root AGENTS.md; not yet authorized) stay role-safe in the same way as the summary: responses a contractor receives never include supplier bank details or payment controls. Name scan failures with distinct error codes (unknown code, code already used, code from another material) so the UI can explain them.

Contract availability, backend readiness, and frontend integration are separate states. A schema existing in this directory does not mean an endpoint is implemented or integrated. Codex owns adjacent shared contract tests.
