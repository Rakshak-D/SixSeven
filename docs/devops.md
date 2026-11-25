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

The compose database is PostgreSQL 16. Its persistent files are bind-mounted to .cache/postgres, and app uploads to .cache/uploads. Both paths are ignored and inside this workspace. Do not remove them as routine cleanup.

Set POSTGRES_PASSWORD in the local .env file. The checked-in .env.example value is a sanitized placeholder, not a credential. Use a URL-safe local value because the app-profile DATABASE_URL is assembled from it; if using reserved URL characters, percent-encode them in the connection URL.

Starting Docker services writes images and container metadata to the Docker engine's storage outside this workspace, even though project database and upload files use local bind mounts. The read-only docker compose config --quiet command can parse the file without starting services. M0 did not start Docker or create a database. Get approval before starting Docker services in a restricted workspace.

Before any migration, seed, or database-backed test, inspect DATABASE_URL and use only a disposable project-local database. Never point it at production, a shared service, or another contributor's data. The current seed is a no-op; there are no demo users or seed records yet.

## CI

The checked-in workflow runs locked dependency installation, Biome CI, typecheck, migration, and Vitest with an ephemeral PostgreSQL service. Do not disable or skip CI steps to manufacture a pass. If a check is unavailable or broken, record NOT_RUN or BLOCKED with the exact reason and get technical-lead approval before skipping it.

Read current workflow runs and results on the PR; do not infer CI status from local results.

## Demo and remote access

The checked-in app profile is scaffold configuration, not a verified deployment. Confirm secrets and the official technical specification before starting it. Do not use unapproved external tunnels, hosting, or database services.
