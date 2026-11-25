# AI, dependency, API, source, and license disclosures

Maintained by Codex. Update this file when tools, external services, dependencies, code sources, or licenses change.

## AI tools and assistance

- Codex: used for M0 repository inspection, coordination/ownership instructions, documentation, local verification, and publication preparation. No business feature was implemented.
- Codex: used during M5 to implement backend reporting, activity, progress/photo storage, the synthetic demo fixture, integration and unit tests, and related documentation. This implementation is AI-assisted code. Local check results are recorded in the backend ledger; hosted PostgreSQL CI is pending.
- Claude: designated by the team for frontend development. The existing FRONTEND_LEDGER.md records Claude's frontend foundation and requests. This M0 Codex run did not use Claude to generate or modify frontend code.
- No external AI provider or model is configured as part of M5; the AI disclosure above describes development assistance, not an application runtime integration.

## External APIs and services

- GitHub public repository and GitHub REST/API access: used to inspect repository metadata, branches, commits, pull requests, and files. The requested coordination branch push and pull request use GitHub. GitHub is not an application runtime API in this M0 change.
- GitHub Actions: configured repository-hosted CI will run the PostgreSQL-backed checks for the M5 pull request.
- The npm registry at registry.npmjs.org was accessed to download the versions already pinned in pnpm-lock.yaml. Corepack downloaded the package-manager version pinned in package.json into the workspace-local .cache/corepack directory.
- No other runtime external API was called or configured by M0.
- Docker was not started and no external database or persistent Docker volume was created by this M0 run.

## Dependencies and licenses

- M5 adds Sharp 0.35.5 as a direct runtime dependency to decode and validate uploaded JPEG, PNG, and WebP content. The package declares Apache-2.0; the version was already present in the lockfile transitively.
- The dependency/license inventory is maintained in README.md. Other package versions are unchanged in this milestone.

## Code sources and project license

- Source retained from the public SixSeven repository after explicit technical-lead confirmation in this task. The inspected history identifies scaffold PR #1 and frontend-ledger PR #2; no external application source was copied into this M0 change.
- The M5 demo progress image is an original synthetic SVG illustration embedded in the opt-in seed and rasterized to PNG with Sharp. It contains no real worker or site photography and uses no external image source.
- Repository LICENSE declares MIT, copyright Rakshak D, 2026.
- This disclosure does not verify provenance of every pre-existing scaffold line or any external artifact that was not accessed.
