<#
.SYNOPSIS
  One-command bring-up after `docker compose up -d`: apply migrations, then seed
  the default users.

.DESCRIPTION
  Two problems with the old flow this fixes:

  1. scripts/apply-migrations.sh needs psql installed on the host. This runs psql
     *inside* the db container, so Docker is the only prerequisite on Windows.
  2. That runner kept no ledger and re-applied every file on every invocation,
     which only works if every migration is idempotent -- and most are not (160
     unguarded CREATE POLICY, 50 CREATE INDEX, bare INSERTs into storage.buckets).
     Here each file is applied at most once, tracked in public.schema_migrations,
     inside a single transaction so a failure leaves nothing half-applied.

  Adopting an already-migrated database: when the ledger is created on a DB that
  already has the schema, every migration up to and including the consolidated
  baseline is marked applied rather than re-run. Later migrations still run.

.EXAMPLE
  npm run bootstrap
  powershell -ExecutionPolicy Bypass -File scripts/bootstrap.ps1 -SkipSeed
#>
[CmdletBinding()]
param(
  # Resolved from compose when omitted, so renaming the project in
  # docker-compose.yml does not silently point this at a stale container.
  [string]$Container,
  [switch]$SkipMigrations,
  [switch]$SkipSeed,
  [int]$TimeoutSeconds = 180
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not $Container) {
  $composeFile = Join-Path $root "docker\docker-compose.yml"
  $id = docker compose --project-directory (Join-Path $root "docker") -f $composeFile ps -q db 2>$null
  if ($LASTEXITCODE -eq 0 -and $id) {
    $Container = (docker inspect -f '{{.Name}}' $id).TrimStart('/')
  } else {
    # Fall back to <compose name:>-db-1 so a stopped stack still resolves.
    $name = (Select-String -Path $composeFile -Pattern '^name:\s*(\S+)' | Select-Object -First 1).Matches[0].Groups[1].Value
    $Container = "$name-db-1"
  }
  Write-Host "Using db container: $Container" -ForegroundColor DarkGray
}

# Migrations at or before this one are the consolidated base schema.
$BaselineMigration = "20260507233921_c94509c4-287d-4387-a906-b3cf74c7aa36.sql"

function Invoke-Psql {
  param([string]$Sql, [switch]$Quiet)
  $args = @("exec", "-i", $Container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1")
  if ($Quiet) { $args += @("-t", "-A", "--quiet") }
  # Suppress "already exists, skipping" NOTICEs from the IF NOT EXISTS guards.
  "SET client_min_messages TO warning;`n$Sql" | & docker @args
}

function Wait-ForDb {
  Write-Host "Waiting for Postgres ($Container)..." -ForegroundColor Cyan
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $state = docker inspect -f '{{.State.Health.Status}}' $Container 2>$null
    if ($LASTEXITCODE -eq 0 -and $state -eq "healthy") {
      Write-Host "  Postgres is healthy." -ForegroundColor Green
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Postgres container '$Container' did not become healthy within $TimeoutSeconds s. Is the stack up? (docker compose --project-directory docker -f docker/docker-compose.yml up -d)"
}

function Initialize-Ledger {
  $sql = @"
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version    text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
"@
  Invoke-Psql -Sql $sql -Quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not create public.schema_migrations." }
}

function Get-AppliedVersions {
  $out = Invoke-Psql -Sql "SELECT version FROM public.schema_migrations;" -Quiet
  if ($LASTEXITCODE -ne 0) { throw "Could not read public.schema_migrations." }
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  # docker exec hands back one multi-line blob, not an array of lines.
  foreach ($line in (($out | Out-String) -split "`r?`n")) {
    $v = $line.Trim()
    if ($v) { [void]$set.Add($v) }
  }
  # Comma prevents PowerShell from unrolling the HashSet into a plain array
  # (an empty one would come back as $null).
  return ,$set
}

function Set-BaselineIfAdopting {
  param($Files, [System.Collections.Generic.HashSet[string]]$Applied)
  # Keyed on the baseline marker rather than an empty ledger, so a run that dies
  # partway through baselining can still be re-baselined on the next attempt.
  if ($Applied.Contains($BaselineMigration)) { return }

  $hasSchema = (Invoke-Psql -Sql "SELECT to_regclass('public.documents') IS NOT NULL;" -Quiet | Out-String).Trim()
  if ($hasSchema -notmatch '^t') { return }   # genuinely fresh DB

  $baseline = @($Files | Where-Object { $_.Name -le $BaselineMigration })
  Write-Host "  Existing schema detected - marking $($baseline.Count) base migrations as already applied." -ForegroundColor Yellow

  # One statement, so it either fully lands or not at all.
  $values = ($baseline | ForEach-Object { "('" + ($_.Name -replace "'", "''") + "')" }) -join ","
  Invoke-Psql -Sql "INSERT INTO public.schema_migrations(version) VALUES $values ON CONFLICT DO NOTHING;" -Quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Baselining the migration ledger failed." }
  foreach ($f in $baseline) { [void]$Applied.Add($f.Name) }
}

function Invoke-Migrations {
  $dir = Join-Path $root "supabase\migrations"
  # Lexicographic order - timestamps sort chronologically.
  $files = Get-ChildItem -Path $dir -Filter *.sql | Sort-Object Name

  Initialize-Ledger
  $applied = Get-AppliedVersions
  Set-BaselineIfAdopting -Files $files -Applied $applied

  $pending = $files | Where-Object { -not $applied.Contains($_.Name) }
  if ($pending.Count -eq 0) {
    Write-Host "Migrations: all $($files.Count) already applied." -ForegroundColor Green
    return
  }

  Write-Host "Applying $($pending.Count) of $($files.Count) migrations..." -ForegroundColor Cyan
  foreach ($f in $pending) {
    Write-Host "  -> $($f.Name)"
    $name = $f.Name -replace "'", "''"
    $body = Get-Content -Raw -Encoding UTF8 $f.FullName
    # --single-transaction: the file and its ledger row commit together, so a
    # failure rolls back cleanly instead of leaving a half-applied migration.
    $sql = "$body`nINSERT INTO public.schema_migrations(version) VALUES ('$name');"
    $sql | & docker exec -i $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction --quiet
    if ($LASTEXITCODE -ne 0) {
      throw "Migration failed (rolled back): $($f.Name)"
    }
  }
  Write-Host "  Migrations applied." -ForegroundColor Green
}

function Invoke-Seed {
  Write-Host "Seeding default users..." -ForegroundColor Cyan
  node (Join-Path $root "scripts\seed-users.mjs")
  if ($LASTEXITCODE -ne 0) { throw "User seeding failed." }
}

Wait-ForDb
if (-not $SkipMigrations) { Invoke-Migrations } else { Write-Host "Skipping migrations." -ForegroundColor Yellow }
if (-not $SkipSeed) { Invoke-Seed } else { Write-Host "Skipping user seeding." -ForegroundColor Yellow }

Write-Host ""
Write-Host "Bootstrap complete." -ForegroundColor Green
