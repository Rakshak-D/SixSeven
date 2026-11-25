# Slate: Every Detail is Accounted For

Slate is a construction-site progress and material tracker. The approved repository baseline is documented in [docs/SPECIFICATION.md](docs/SPECIFICATION.md). [docs/API.md](docs/API.md) tracks contract availability and runtime readiness.

## Current architecture reference

The scaffold contains one Next.js App Router application, Hono REST API at /api/v1, Drizzle with PostgreSQL, Better Auth dependencies, shared Zod schemas, and OpenAPI generation. This is the approved stack for implementation.

## Run the scaffold

Needs Node 24 (.nvmrc) and pnpm 12.23.0 as pinned in package.json. Do not install pnpm globally; configure project-local package-manager caches as described in docs/devops.md. Docker provides PostgreSQL 16, or use an approved disposable project-local PostgreSQL database.

~~~sh
corepack pnpm install --frozen-lockfile --store-dir .cache/pnpm-store
cp .env.example .env
# Replace the sanitized local values in .env before starting services.
# Docker writes image/container state outside the workspace; use only when approved.
docker compose up -d db
corepack pnpm db:migrate
corepack pnpm dev
~~~

The current seed script is a no-op. No demo accounts or demo records exist. GET /api/v1/health and GET /api/v1/doc have handlers in the scaffold, but M0 has not run them against a database. Other listed API route modules are empty routers.

## Checks

Use the non-mutating Biome CI command and typecheck before a commit. The full Vitest suite includes a health test that requires PostgreSQL; verify DATABASE_URL and use an isolated disposable database before database-backed checks. Do not use lint:fix as a check because it rewrites files.

The existing frontend ledger records no pages or live API integrations. Do not report screens, auth, database features, or API routes as implemented merely because files or route mounts exist.

## Contributor instructions

AGENTS.md is canonical. Root and nested CLAUDE.md files reference the corresponding AGENTS.md. docs/API.md is the canonical contract and is written by Codex. docs/FRONTEND_LEDGER.md is maintained only by Claude after its initialization. Read docs/devops.md for local tool and data paths.

AI SDK packages are present in the scaffold, but no provider, model, prompt, or AI workflow has been approved or implemented.

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
