#!/bin/sh
# Start command for the API container (Render web service / self-hosters).
#
# 1. Port: Render assigns the listen port through $PORT; the API itself reads
#    $API_PORT. Honour whichever is set, then fall back to the dev default.
# 2. Migrations run here, not in CI: the container is the only place holding
#    the production DATABASE_URL (ADR-007). `migrate deploy` is idempotent —
#    it is a no-op when the database is already up to date.
set -e

export API_PORT="${PORT:-${API_PORT:-4000}}"

pnpm --filter @shipyard/api db:migrate:deploy
exec node apps/api/dist/server.js
