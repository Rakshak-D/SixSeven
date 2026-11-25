# Test ownership and safe execution

Read root AGENTS.md and the relevant lane instructions before adding or changing tests.

- Codex owns backend unit tests, shared contract tests, tests/api/**, and backend/integration testing.
- Claude owns frontend-specific tests and tests/e2e/**. Cross-stack release acceptance scope and shared setup must be assigned in PROJECT_LEDGER.md before editing.
- Test ownership follows the implementation owner for tests stored beside source files.
- Do not add tests for unapproved business behavior. For authorized backend features, cover critical success and failure cases, input validation, authorization, and data integrity.

Once the planned anti-fraud and payments feature is authorized (root AGENTS.md), its tests must cover at least these cases:
- a usage with an unknown or already used bag code is refused
- the contractor is refused on payment, approval and bank-change routes
- a bank change stays pending through its cooldown
- "ready to pour" is blocked without steel photos
- auto-release happens only for a matching verified delivery
- repeating a payment request with the same idempotency key pays once

The current health API test expects a reachable PostgreSQL database. Do not start Docker or connect tests to an external or production database without explicit approval. Before database tests, verify DATABASE_URL and use a disposable database under this workspace.

Do not disable tests, lint checks, security checks, or CI to manufacture a passing status. If a check cannot run, report NOT_RUN and its exact reason. Skipping a broken check requires explicit technical-lead approval and a documented limitation.
