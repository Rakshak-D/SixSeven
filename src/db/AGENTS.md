# Database ownership: src/db/

Codex exclusively owns database schemas, migrations, seed data, and database access. Read root AGENTS.md, PROJECT_LEDGER.md, BACKEND_LEDGER.md, and docs/API.md before changes.

The checked-in Drizzle schemas are currently empty and the baseline migration is a no-op. Do not mistake table names or rules in old scaffold notes for implemented or approved requirements. Wait for the full project specification before adding schema or seed data.

For authorized schema work, inspect migration history and the target database first. Never rewrite or delete a migration already on main; add a new migration. Generate migrations with the pinned project tooling and review the generated SQL. Use transactions for related mutations when required by the confirmed specification.

The scaffold mentions integer paise and append-only ledgers. Preserve these only if confirmed by the specification. A database trigger or append-only policy does not by itself provide cryptographic tamper evidence.

Run migrations or database tests only against an isolated, disposable database stored inside this workspace. Verify DATABASE_URL before every database command. Do not create external volumes/directories, access production data, or use another contributor's database without explicit approval.
