#!/usr/bin/env bash
# Apply pending SQL migrations to the local Postgres instance (port 54322),
# then seed the default users.
#
# Each file is applied at most once, tracked in public.schema_migrations, inside
# a single transaction. The previous version kept no ledger and re-applied every
# file on every run, which only works if every migration is idempotent -- and
# most are not (160 unguarded CREATE POLICY, 50 CREATE INDEX, bare INSERTs into
# storage.buckets).
#
# Adopting an already-migrated database: when the ledger is created on a DB that
# already has the schema, every migration up to and including the consolidated
# baseline is marked applied rather than re-run. Later migrations still run.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
PGPASSWORD="${POSTGRES_PASSWORD:-your-super-secret-postgres-password}"
export PGPASSWORD

# Migrations at or before this one are the consolidated base schema.
BASELINE_MIGRATION="20260507233921_c94509c4-287d-4387-a906-b3cf74c7aa36.sql"

PSQL="psql -h localhost -p 54322 -U postgres -d postgres -v ON_ERROR_STOP=1"
PSQL_Q="$PSQL -t -A --quiet"

echo "Waiting for Postgres..."
until $PSQL -c "SELECT 1" >/dev/null 2>&1; do
  sleep 2
done

$PSQL_Q -c "CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);" >/dev/null

# Baseline an existing (pre-ledger) database so we do not re-run its base schema.
# Keyed on the baseline marker rather than an empty ledger, so a run that dies
# partway through baselining can still be re-baselined on the next attempt.
baselined=$($PSQL_Q -c "SELECT 1 FROM public.schema_migrations WHERE version = '$BASELINE_MIGRATION';")
has_schema=$($PSQL_Q -c "SELECT to_regclass('public.documents') IS NOT NULL;")
if [ -z "$baselined" ] && [ "$has_schema" = "t" ]; then
  echo "Existing schema detected - marking base migrations as already applied."
  for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    name="$(basename "$f")"
    if [[ "$name" > "$BASELINE_MIGRATION" ]]; then continue; fi
    $PSQL_Q -c "INSERT INTO public.schema_migrations(version) VALUES ('$name') ON CONFLICT DO NOTHING;" >/dev/null
  done
fi

echo "Applying pending migrations from $MIGRATIONS_DIR ..."
pending=0
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name="$(basename "$f")"
  seen=$($PSQL_Q -c "SELECT 1 FROM public.schema_migrations WHERE version = '$name';")
  if [ -n "$seen" ]; then continue; fi

  echo "  -> $name"
  pending=$((pending + 1))
  # The file and its ledger row commit together, so a failure rolls back cleanly
  # instead of leaving a half-applied migration.
  {
    cat "$f"
    printf "\nINSERT INTO public.schema_migrations(version) VALUES ('%s');\n" "$name"
  } | $PSQL --single-transaction --quiet
done

if [ "$pending" -eq 0 ]; then
  echo "  Nothing to apply - already up to date."
else
  echo "  Applied $pending migration(s)."
fi

# Seed the default users (one per app_role). Gated by SEED_DEFAULT_USERS in
# docker/.env; a missing node warns rather than failing the migration run.
if command -v node >/dev/null 2>&1; then
  node "$ROOT/scripts/seed-users.mjs"
else
  echo "node not found - skipping user seeding. Run 'npm run seed:users' once Node is available."
fi

echo "Done."
