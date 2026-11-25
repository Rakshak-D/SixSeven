# SixSeven

Construction site progress and material tracker (hackathon problem 21). Contractors log deliveries,
usage, attendance and wages; owners see verified spend, photos and approve changes. Nothing in the
ledger can be quietly edited and stock can't go negative.

Stack: Next.js 16 (App Router) · Hono REST API at `/api/v1` · Drizzle + Postgres 16 · Better Auth ·
shadcn/ui + Tailwind · Vitest + Playwright.

## Run it

Needs Node 24 (`.nvmrc`), pnpm (`npm i -g pnpm`; the repo pins the version), and Docker for Postgres
(or any local Postgres 16 via `DATABASE_URL`).

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm db:migrate && pnpm db:seed
pnpm dev            # http://localhost:3000  ·  API: /api/v1/health, /api/v1/doc
```

Checks before every commit: `pnpm lint:fix && pnpm typecheck && pnpm test`.

Demo users (after seeding): owner@demo, contractor@demo, engineer@demo. Password: _set by the seed_.

## For contributors (people and agents)

Rules live in [`AGENTS.md`](AGENTS.md) and in the `AGENTS.md` of each module folder. Routes and their
status are in [`docs/API.md`](docs/API.md); Docker, CI and Tailscale in [`docs/devops.md`](docs/devops.md).

AI: the optional checklist drafter uses the provider and model named here once chosen (_TBD_);
without a key it falls back to a template.

## Dependency licences

Adding a dependency? Add its row here in the same PR.

| Package | Licence | Use |
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

## Licence

MIT, see [LICENSE](LICENSE).
