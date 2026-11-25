# Frontend components: src/components/

Claude owns components, styles, and frontend assets under this directory. Read the root AGENTS.md and src/app/AGENTS.md first.

Components consume the canonical contract and frontend API client. They do not define server routes, database access, authorization, or independent API schemas. Use contract-derived development fixtures only, and label mocked behavior so it cannot be mistaken for a live API result.

Use docs/SPECIFICATION.md for authorized frontend milestones. Coordinate shared component configuration or root dependency requests through FRONTEND_LEDGER.md; Codex owns shared configuration and dependency manifests.
