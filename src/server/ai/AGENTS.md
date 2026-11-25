# AI integrations: src/server/ai/

Codex owns server-side AI integrations, provider configuration, validation, error handling, and tests. The checklist draft and template fallback are specified in docs/SPECIFICATION.md. Provider selection and runtime integration belong to a later authorized milestone.

Keep credentials in environment variables and out of source control and logs. Validate model output against the canonical shared schema before returning or persisting it. Clearly identify generated suggestions and preserve any required human review from the confirmed specification. Tests must not call live model APIs; use deterministic fixtures.

Record AI tools, providers, runtime APIs, dependencies, and licenses in docs/DISCLOSURES.md and the dependency inventory when a future feature is authorized.
