#!/usr/bin/env bash
# Run the procurement stage-engine and RLS check against the local stack.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${POSTGRES_PASSWORD:-}" ] && [ -f "$ROOT/docker/.env" ]; then
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$ROOT/docker/.env" | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
PGPASSWORD="${POSTGRES_PASSWORD:-your-super-secret-postgres-password}"
export PGPASSWORD

# Captured rather than streamed so the PASS notices can be counted, but printed
# whatever psql's exit status is -- swallowing the output on failure would hide
# the one line that says what broke.
set +e
output=$(psql -h localhost -p 54322 -U postgres -d postgres -f "$ROOT/scripts/check-procurement.sql" 2>&1)
status=$?
set -e
echo "$output"

if [ "$status" -ne 0 ] || echo "$output" | grep -q 'ERROR'; then
  echo ""
  echo "check-procurement: FAILED"
  exit 1
fi

passes=$(echo "$output" | grep -c 'PASS:' || true)
echo ""
echo "check-procurement: OK ($passes assertions passed)"
