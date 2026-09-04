#!/usr/bin/env bash
# Regenerate src/integrations/supabase/types.ts from the local database.
#
# The CLI emits every schema it can see (graphql_public, storage) and drops the
# __InternalSupabase marker the app was generated with; this keeps the file's
# established shape — public only, marker preserved — so a regeneration is a
# content diff rather than a structural one.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/src/integrations/supabase/types.ts"
TMP="$(mktemp -t jyoma-types.XXXXXX.ts)"
trap 'rm -f "$TMP"' EXIT

if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -f "$ROOT/docker/.env" ]; then
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/docker/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-your-super-secret-postgres-password}"

echo "Generating types from the local database..."
npx --yes supabase@latest gen types typescript \
  --db-url "postgresql://postgres:${POSTGRES_PASSWORD}@localhost:54322/postgres" > "$TMP"

python3 "$ROOT/scripts/trim-generated-types.py" "$TMP" "$OUT"
echo "Wrote $OUT"
