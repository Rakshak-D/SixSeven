#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) === 24 ? 0 : 1)'; then
  echo 'Install Node 24 with Corepack, then retry.' >&2
  exit 1
fi
exec node scripts/start-local.mjs "$@"
