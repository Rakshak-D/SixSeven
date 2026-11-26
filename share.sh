#!/usr/bin/env bash
# Share this machine's Slate over a Cloudflare quick tunnel so other laptops can use it.
# Usage: ./share.sh [--build] [--port 3100]
# Needs: cloudflared on PATH, a migrated database in .env, and a production build (--build makes one).
# Stop with Ctrl+C. The https://*.trycloudflare.com address changes on every run.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
PORT=3100 BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --build) BUILD=1 ;;
    --port) PORT=$2; shift ;;
    *) echo "unknown option $1" >&2; exit 1 ;;
  esac
  shift
done
command -v cloudflared >/dev/null || { echo "Install cloudflared first (see docs/HANDBOOK.md)" >&2; exit 1; }
if [ "$BUILD" = 1 ] || [ ! -f .next/BUILD_ID ]; then corepack pnpm build; fi

LOG=$(mktemp)
cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" >"$LOG" 2>&1 &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null; rm -f "$LOG"' EXIT
URL=""
for _ in $(seq 60); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 1
done
[ -n "$URL" ] || { echo "No tunnel address after 60 s:" >&2; tail -20 "$LOG" >&2; exit 1; }

echo
echo "  Slate is shared at: $URL"
echo "  (only this address works for sign-in while sharing; localhost:$PORT will not)"
echo
# Sign-in accepts only BETTER_AUTH_URL as its origin, so point it at the tunnel for this run.
BETTER_AUTH_URL=$URL NODE_ENV=production corepack pnpm exec next start -p "$PORT"
