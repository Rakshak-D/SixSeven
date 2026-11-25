# Database ownership: src/db/

Codex exclusively owns database schemas, migrations, seed data, and database access. Read root AGENTS.md, PROJECT_LEDGER.md, BACKEND_LEDGER.md, and docs/API.md before changes.

The schema includes auth, projects, project memberships, materials, workers, stock movements and audit history. Use docs/SPECIFICATION.md as the approved baseline when database work is authorized.

For authorized schema work, inspect migration history and the target database first. Never rewrite or delete a migration already on main; add a new migration. Generate migrations with the pinned project tooling and review the generated SQL. Use transactions for related mutations when required by the confirmed specification.

Planned anti-fraud and payments data (root AGENTS.md; not yet authorized): a bag code is unique within a project, links to one delivery, and is consumed by at most one usage, enforced in the database. Scan events, approvals and payments are append-only. Each payment's idempotency key is unique. A supplier bank change is a pending request with a cooldown end time, never an in-place overwrite. Order price caps, spending rules and payments are integer paise.

Preserve integer paise and the specified append-only ledgers. A database trigger or append-only policy does not by itself provide cryptographic tamper evidence.

Run migrations or database tests only against an isolated, disposable database stored inside this workspace. Verify DATABASE_URL before every database command. Do not create external volumes/directories, access production data, or use another contributor's database without explicit approval.
