#!/bin/sh
set -eu
echo "[frateli-web] Running database migrations and bootstrap check..."
node dist/db/migrate.js
echo "[frateli-web] Starting Next.js standalone server..."
exec node server.js
