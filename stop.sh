#!/usr/bin/env bash
# Stops the app (and PostgreSQL, if start.sh started it). Data is preserved.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/start.local.sh" --stop
