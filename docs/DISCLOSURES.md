# AI, dependency, API, source, and license disclosures

Maintained by Codex. Update this file when tools, external services, dependencies, code sources, or licenses change.

## AI tools and assistance

- Codex: used for M0 repository inspection, coordination/ownership instructions, documentation, local verification, and publication preparation. No business feature was implemented.
- Claude: designated by the team for frontend development. The existing FRONTEND_LEDGER.md records Claude's frontend foundation and requests. This M0 Codex run did not use Claude to generate or modify frontend code.
- No AI-generated business behavior is represented as implemented.

## External APIs and services

- GitHub public repository and GitHub REST/API access: used to inspect repository metadata, branches, commits, pull requests, and files. The requested coordination branch push and pull request use GitHub. GitHub is not an application runtime API in this M0 change.
- The npm registry at registry.npmjs.org was accessed to download the versions already pinned in pnpm-lock.yaml. Corepack downloaded the package-manager version pinned in package.json into the workspace-local .cache/corepack directory.
- No other runtime external API was called or configured by M0.
- Docker was not started and no external database or persistent Docker volume was created by this M0 run.

## Dependencies and licenses

- No dependency was added, removed, or upgraded by M0.
- Existing package and development dependency inventory and declared license rows remain in README.md; the lockfile is retained.
- The README license table is inherited scaffold metadata and has not been independently audited package-by-package in M0. Verify any future dependency and its license before adding it.

## Code sources and project license

- Source retained from the public SixSeven repository after explicit technical-lead confirmation in this task. The inspected history identifies scaffold PR #1 and frontend-ledger PR #2; no external application source was copied into this M0 change.
- Repository LICENSE declares MIT, copyright Rakshak D, 2026.
- This disclosure does not verify provenance of every pre-existing scaffold line or any external artifact that was not accessed.
