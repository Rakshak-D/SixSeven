# Slate: Every Detail is Accounted For

Slate is a construction-site progress and material tracker. The approved repository baseline is documented in [docs/SPECIFICATION.md](docs/SPECIFICATION.md). [docs/API.md](docs/API.md) tracks contract availability and runtime readiness.

## Current architecture reference

Slate uses one Next.js App Router application, Hono REST API at /api/v1, Drizzle with PostgreSQL, Better Auth, shared Zod schemas, and OpenAPI generation. This is the approved stack for implementation.

## Run Slate on Windows

Install Node 24 with Corepack, PowerShell 7.2 or newer, and Docker Desktop in Linux container mode. Open Docker Desktop and wait for the engine. From the repository root, run:

```powershell
.\start.ps1             # Keep the frontend mode configured in .env
.\start.ps1 -Prototype  # Enable frontend mocks for this run
.\start.ps1 -Live       # Disable frontend mocks for this run
.\start.ps1 -Seed       # Explicitly apply the repeatable demo seed, then start
.\start.ps1 -Live -Seed # Combine live mode and demo seeding
.\stop.ps1              # Stop this launcher session
```

The launcher creates `.env` only when missing and stores the generated demo password there. It initializes a verified empty demo database when a valid demo password is configured. To sign in, use that password with `owner@demo.invalid`, `contractor@demo.invalid` or `engineer@demo.invalid`. An existing database is seeded only when you pass `-Seed`. After the launcher confirms the app responds and PostgreSQL is up, it prints the app, health and OpenAPI URLs. New configuration defaults to live mode. Use the printed application URL for sign-in so the browser origin matches BETTER_AUTH_URL. Choose -Prototype explicitly for development fixtures. No AI credentials are required to use the rest of Slate.

The app runs in the launcher terminal. Ctrl+C exits the app and leaves PostgreSQL running. Run `.\stop.ps1` from a second terminal while the launcher is active. It stops the app and stops PostgreSQL only if that launcher session started it. An already running database is reused and stays running. With no active launcher, the stop command leaves existing services running.

For a separate checkout, choose a unique `SLATE_COMPOSE_PROJECT` and unused ports. The port flags initialize a missing `.env`. Keep the same Compose project setting in both terminals:

```powershell
$env:SLATE_COMPOSE_PROJECT = 'slate-sandbox'
.\start.ps1 -AppPort 3100 -DatabasePort 55432 -Live
```

The launcher checks the authentication origin and database identity. It requires an empty database or the matching Slate migration history, and accepts only a loopback Compose `slate_demo` database (including suffixed demo names). For existing configurations, edit `.env` explicitly to change ports. Keep `DB_PORT` and `DATABASE_URL` in sync. Process environment values take precedence over `.env`. The launcher passes the resulting database credentials and identity to Compose, migrations, seeding and the app, ahead of Next.js dotenv overrides. Use a local Docker Desktop context. Project caches and PostgreSQL data are under `.cache`. Docker Desktop manages its images and container metadata.

Run a script by absolute path from any working directory.

## Run Slate on Linux or macOS

Install Node 24, Corepack and a running local Docker Engine with Compose v2. Run from the repository root:

```bash
./start.sh --live
./start.sh --live --seed  # Seed an existing disposable demo database
```

The shell launcher always uses live APIs. It creates a missing `.env` with local credentials, verifies the checkout's Compose database before migrations and runs the app in the foreground. An empty demo database with a valid demo password is seeded on first startup. Use the same demo emails and local password described above. Ctrl+C stops the app, leaving PostgreSQL and its data in place. Use the printed health endpoint to confirm the app is ready.

For an isolated checkout set a unique `SLATE_COMPOSE_PROJECT`, and configure unused ports in `.env` using `DB_PORT`, `DATABASE_URL` and `BETTER_AUTH_URL`.

See [development setup](docs/devops.md) for manual setup and [API.md](docs/API.md) for endpoint status.

## Checks

Use the non-mutating Biome CI command and typecheck before a commit. The full Vitest suite includes a health test that requires PostgreSQL; verify DATABASE_URL and use an isolated disposable database before database-backed checks. Do not use lint:fix as a check because it rewrites files.

The project switcher and project pages are present. Frontend requests go through the API client, which can serve supported development fixtures in prototype mode. Live mode sends those requests to the backend. For current screen and workflow coverage, see [the frontend ledger](docs/FRONTEND_LEDGER.md) and [API status](docs/API.md).

Run the PowerShell launcher regressions from an isolated worktree with an initialized disposable Compose database and no running app. Pass the sandbox project and app port to `.\tests\windows-launcher.test.ps1 -Project slate-launcher-test-local -AppPort 3100`.

## Contributor instructions

AGENTS.md is canonical. Root and nested CLAUDE.md files reference the corresponding AGENTS.md. docs/API.md is the canonical contract and is written by Codex. docs/FRONTEND_LEDGER.md is maintained only by Claude after its initialization. Read docs/devops.md for local tool and data paths.

Ask Slate is optional and shows an offline state until AI_PROVIDER, AI_MODEL and AI_API_KEY are configured. Use a provider-supported model and its own API key. For an explicitly selected OpenAI-compatible provider, set AI_BASE_URL to its approved HTTPS API origin. Checklist generation keeps its labelled template fallback. The concrete calculator uses local formulas and runs offline from the provider.

Supplier payments and medical reimbursements use a mock provider. Use synthetic account data when demonstrating these workflows. No funds move.

## Dependency licenses

The following is the inherited declared dependency/license inventory. Codex maintains it with any future approved dependency change; licenses have not been independently re-audited in M0.

| Package | Declared licence | Use |
|---|---|---|
| @ai-sdk/google | Apache-2.0 | runtime |
| @ai-sdk/groq | Apache-2.0 | runtime |
| @ai-sdk/openai-compatible | Apache-2.0 | runtime |
| @hono/zod-openapi | MIT | runtime |
| @tanstack/react-query | MIT | runtime |
| ai | Apache-2.0 | runtime |
| better-auth | MIT | runtime |
| class-variance-authority | Apache-2.0 | runtime |
| cn | MIT | runtime |
| drizzle-orm | Apache-2.0 | runtime |
| hono | MIT | runtime |
| lucide-react | ISC | runtime |
| next | MIT | runtime |
| next-themes | MIT | runtime |
| pdfkit | MIT | runtime |
| postgres | Unlicense | runtime |
| radix-ui | MIT | runtime |
| react | MIT | runtime |
| react-dom | MIT | runtime |
| recharts | MIT | runtime |
| shadcn | MIT | runtime |
| sharp | Apache-2.0 | runtime |
| sonner | MIT | runtime |
| tw-animate-css | MIT | runtime |
| zod | MIT | runtime |
| @biomejs/biome | MIT OR Apache-2.0 | dev |
| @faker-js/faker | MIT | dev |
| @playwright/test | Apache-2.0 | dev |
| @tailwindcss/turbopack | MIT | dev |
| @types/node | MIT | dev |
| @types/pdfkit | MIT | dev |
| @types/react | MIT | dev |
| @types/react-dom | MIT | dev |
| drizzle-kit | MIT | dev |
| tailwindcss | MIT | dev |
| tsx | MIT | dev |
| typescript | Apache-2.0 | dev |
| vitest | MIT | dev |

## License

MIT, see LICENSE.

M6 checklist drafts run deterministically from a local template. The inherited provider packages are present in the lockfile for deferred work. Running Slate and generating checklists require no AI provider credentials.
