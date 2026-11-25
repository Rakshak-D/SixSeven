# Development and operations

Codex owns this file and the repository's CI, build, database, container, and deployment configuration.

## Runtime and package manager

The repository pins Node 24 in .nvmrc and pnpm 12.23.0 in package.json. Do not install packages globally. Keep Corepack, npm, pnpm, and temporary files inside ignored .cache paths where supported.

Example PowerShell setup from the repository root:

~~~
$local = (Resolve-Path .).Path
New-Item -ItemType Directory -Force .cache/corepack, .cache/npm, .cache/tmp | Out-Null
$env:COREPACK_HOME = Join-Path $local '.cache/corepack'
$env:npm_config_cache = Join-Path $local '.cache/npm'
$env:TEMP = Join-Path $local '.cache/tmp'
$env:TMP = $env:TEMP
pnpm install --frozen-lockfile --store-dir (Join-Path $local '.cache/pnpm-store')
~~~

Use equivalent project-local environment variables on other shells. Do not use lint:fix as a check because it rewrites files; use the non-mutating CI command.

## Database and Docker

The compose database is PostgreSQL 16. Its persistent files are bind-mounted to .cache/postgres, and app uploads to .cache/uploads. Both paths are ignored and inside this workspace. Uploaded images are validated and staged before database writes; database failures clean up files created by that request. A process crash between filesystem promotion and database commit can leave an orphan file, so storage does not provide distributed atomicity. Do not remove these paths as routine cleanup.

Set POSTGRES_PASSWORD in the local .env file. The checked-in .env.example value is a sanitized placeholder, not a credential. Use a URL-safe local value because the app-profile DATABASE_URL is assembled from it; if using reserved URL characters, percent-encode them in the connection URL.

Starting Docker services writes images and container metadata to the Docker engine's storage outside this workspace, even though project database and upload files use local bind mounts. The read-only docker compose config --quiet command can parse the file without starting services. M0 did not start Docker or create a database. Get approval before starting Docker services in a restricted workspace.

Runtime requires an explicit `DATABASE_URL` with the PostgreSQL host, user and database. The app initializes the connection lazily so production builds can run without database credentials. Auth requires a generated `BETTER_AUTH_SECRET` of at least 32 characters and the canonical `BETTER_AUTH_URL` origin, with HTTPS in production.

For an approved disposable development instance, set `DATABASE_URL` to the loopback port and database `slate_demo` (or `slate_demo_<suffix>`). Compose binds the database port to loopback and defaults the database name to `slate_demo` on first initialization. Existing PostgreSQL data directories retain their original databases. Confirm the actual database before proceeding.

1. Verify the target is disposable and set `SLATE_MIGRATION_DATABASE` to its exact database name before `pnpm db:migrate`.
2. Set `SLATE_DEMO_SEED=1` and `SLATE_DEMO_PASSWORD` (a generated local secret of 12–64 characters) in ignored `.env`, then run `pnpm db:seed`. The seed provisions the three demo identities plus an isolated account through Better Auth. Repeated runs preserve existing data and passwords.
3. Start the development app and sign in with one of the synthetic emails in [API.md](API.md).

Database tests require `SLATE_TEST_DATABASE=1`, a loopback `slate_test` or `slate_test_<suffix>` database, a migrated schema and seeded fixtures. CI configures those and invokes the seed twice. The migration upgrade test creates and removes a uniquely named scratch database on that disposable instance, so it requires the test role to have CREATEDB. For schema-only tests use `pnpm exec vitest run src/shared`.

## CI

The checked-in workflow runs locked dependency installation, Biome CI, typecheck, migration, and Vitest with an ephemeral PostgreSQL service. Do not disable or skip CI steps to manufacture a pass. If a check is unavailable or broken, record NOT_RUN or BLOCKED with the exact reason and get technical-lead approval before skipping it.

Read current workflow runs and results on the PR; do not infer CI status from local results.

## Demo and remote access

The checked-in app profile is scaffold configuration, not a verified deployment. Confirm secrets and the official technical specification before starting it. Do not use unapproved external tunnels, hosting, or database services.
