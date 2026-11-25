# Contract: `src/shared/`

Imported by both the browser and the server: no Node-only imports, no DB, no Hono here.

- `schemas/<resource>.ts`: Zod request and response schemas, one file per resource, named exports
  (`CreateDeliveryInput`, `StockResponse`, ...). Plain `zod`, so the frontend can import them.
  No `index.ts` barrel. `schemas/common.ts` has `Paise`, `Qty`, `IsoDate`, `Role`.
- `errors.ts`: every API error code and the `{ error: { code, message, details } }` schema.
- `money.ts`: the only place paise ↔ rupees happens (`rupeesToPaise`, `formatINR`).

## Changing the contract

- **Adding** a new schema file or a new optional field: anyone, anytime.
- **Changing or removing** an exported schema or field: post in team chat, then a PR touching only
  `src/shared/` (and `docs/API.md`), merged before the code that uses it. Both sides fix their code
  on their own branches after.
- Request and response schemas are separate even when they look alike (ids, `created_at`,
  computed fields only exist in responses).

## Tests

Unit-test any helper with logic (`money.test.ts` is the pattern), next to the file.
