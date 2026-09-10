#!/usr/bin/env bash
# One-command bring-up after `docker compose up -d`: apply migrations, then
# seed the default users. Cross-platform replacement for bootstrap.ps1 (which
# required Windows PowerShell specifically -- `powershell`, not the
# cross-platform `pwsh` -- so it never ran on Linux/macOS hosts).
#
# Runs psql *inside* the db container via `docker exec`/`docker cp`, so Docker
# is the only prerequisite -- no local `psql` needed, unlike scripts/migrate.sh.
#
# Each migration file is applied at most once, tracked in
# public.schema_migrations, inside a single transaction, so a failure leaves
# nothing half-applied.
#
# Adopting an already-migrated database: when the ledger is created on a DB
# that already has the schema, every migration up to and including the
# consolidated baseline is marked applied rather than re-run. Later
# migrations still run.
#
# Usage:
#   npm run bootstrap
#   bash scripts/bootstrap.sh --skip-migrations
#   bash scripts/bootstrap.sh --skip-seed
#   CONTAINER=my-postgres bash scripts/bootstrap.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT/docker/docker-compose.yml"
MIGRATIONS_DIR="$ROOT/supabase/migrations"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-180}"

SKIP_MIGRATIONS=0
SKIP_SEED=0
for arg in "$@"; do
  case "$arg" in
    --skip-migrations) SKIP_MIGRATIONS=1 ;;
    --skip-seed) SKIP_SEED=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# Resolved from compose when not set, so renaming the project in
# docker-compose.yml does not silently point this at a stale container.
if [ -z "${CONTAINER:-}" ]; then
  id="$(docker compose --project-directory "$ROOT/docker" -f "$COMPOSE_FILE" ps -q db 2>/dev/null || true)"
  if [ -n "$id" ]; then
    CONTAINER="$(docker inspect -f '{{.Name}}' "$id" | sed 's#^/##')"
  else
    # Fall back to the db service's explicit container_name so a stopped
    # stack still resolves. Matched by the name containing "postgres" (not by
    # compose service key, which is `db:`) to mirror what bootstrap.ps1 did.
    CONTAINER="$(grep -E '^\s*container_name:\s*\S*postgres\S*' "$COMPOSE_FILE" | head -n1 | sed -E 's/.*container_name:[[:space:]]*([^[:space:]]+).*/\1/')"
    CONTAINER="${CONTAINER:-jyoma-postgres}"
  fi
  echo "Using db container: $CONTAINER"
fi

# Migrations at or before this one are the consolidated base schema.
BASELINE_MIGRATION="20260507233921_c94509c4-287d-4387-a906-b3cf74c7aa36.sql"

psql_exec() {
  # Suppress "already exists, skipping" NOTICEs from the IF NOT EXISTS guards.
  printf "SET client_min_messages TO warning;\n%s\n" "$1" | \
    docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1
}

psql_exec_quiet() {
  printf "SET client_min_messages TO warning;\n%s\n" "$1" | \
    docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -t -A --quiet
}

wait_for_db() {
  echo "Waiting for Postgres ($CONTAINER)..."
  local deadline=$(( $(date +%s) + TIMEOUT_SECONDS ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    local state
    state="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || true)"
    if [ "$state" = "healthy" ]; then
      echo "  Postgres is healthy."
      return 0
    fi
    sleep 2
  done
  echo "Postgres container '$CONTAINER' did not become healthy within ${TIMEOUT_SECONDS}s. Is the stack up? (docker compose --project-directory docker -f docker/docker-compose.yml up -d)" >&2
  exit 1
}

run_migrations() {
  psql_exec_quiet "CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version    text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );" >/dev/null

  # Keyed on the baseline marker rather than an empty ledger, so a run that
  # dies partway through baselining can still be re-baselined on the next
  # attempt.
  local baselined has_schema
  baselined="$(psql_exec_quiet "SELECT 1 FROM public.schema_migrations WHERE version = '$BASELINE_MIGRATION';")"
  if [ -z "$baselined" ]; then
    has_schema="$(psql_exec_quiet "SELECT to_regclass('public.documents') IS NOT NULL;")"
    if [ "$has_schema" = "t" ]; then
      echo "  Existing schema detected - marking base migrations as already applied."
      local values="" name
      for f in "$MIGRATIONS_DIR"/*.sql; do
        name="$(basename "$f")"
        [[ "$name" > "$BASELINE_MIGRATION" ]] && continue
        name="${name//\'/\'\'}"
        values="${values:+$values,}('$name')"
      done
      if [ -n "$values" ]; then
        psql_exec_quiet "INSERT INTO public.schema_migrations(version) VALUES $values ON CONFLICT DO NOTHING;" >/dev/null
      fi
    fi
  fi

  local pending=0 seen name
  for f in "$MIGRATIONS_DIR"/*.sql; do
    name="$(basename "$f")"
    seen="$(psql_exec_quiet "SELECT 1 FROM public.schema_migrations WHERE version = '$name';")"
    [ -n "$seen" ] && continue

    echo "  -> $name"
    pending=$((pending + 1))
    # The file and its ledger row commit together, so a failure rolls back
    # cleanly instead of leaving a half-applied migration. Piped directly
    # (not through a docker-cp'd temp file) -- bash pipes carry bytes as-is,
    # unlike PowerShell 5.1's console-encoding re-write of piped stdin, which
    # was the reason bootstrap.ps1 routed through `docker cp` instead.
    {
      cat "$f"
      printf "\nINSERT INTO public.schema_migrations(version) VALUES ('%s');\n" "${name//\'/\'\'}"
    } | docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction --quiet
  done

  if [ "$pending" -eq 0 ]; then
    echo "Migrations: all up to date."
  else
    echo "Migrations applied: $pending."
  fi
}

run_seed() {
  echo "Seeding default users..."
  node "$ROOT/scripts/seed-users.mjs"
}

wait_for_db
if [ "$SKIP_MIGRATIONS" -eq 0 ]; then
  echo "Applying migrations from $MIGRATIONS_DIR ..."
  run_migrations
else
  echo "Skipping migrations."
fi
if [ "$SKIP_SEED" -eq 0 ]; then
  run_seed
else
  echo "Skipping user seeding."
fi

echo
echo "Bootstrap complete."
