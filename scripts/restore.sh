#!/usr/bin/env bash
# Restore a previously-taken backup. DESTRUCTIVE — wipes current DB + uploads.
# Usage:
#   scripts/restore.sh                          # picks the most recent backup
#   scripts/restore.sh backups/2026-05-14_..    # picks a specific one
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "✗ .env not found in $(pwd)" >&2
  exit 1
fi
set -o allexport; . ./.env; set +o allexport

: "${POSTGRES_USER:?missing POSTGRES_USER in .env}"
: "${POSTGRES_DB:?missing POSTGRES_DB in .env}"

if [[ $# -ge 1 ]]; then
  src="$1"
else
  src="$(ls -1d backups/*/ 2>/dev/null | sort | tail -1 || true)"
  if [[ -z "$src" ]]; then
    echo "✗ no backups found in ./backups/" >&2
    exit 1
  fi
  src="${src%/}"
fi

if [[ ! -f "$src/db.sql.gz" ]]; then
  echo "✗ $src/db.sql.gz not found — not a valid backup directory" >&2
  exit 1
fi

echo "About to restore from:  $src"
ls -lh "$src"
echo
echo "⚠ this will REPLACE the current database and uploads volume."
read -r -p "Type 'restore' to continue: " confirm
if [[ "$confirm" != "restore" ]]; then
  echo "aborted."
  exit 1
fi

echo
echo "→ stopping app containers..."
docker compose stop backend frontend 2>/dev/null || true

echo "→ wiping current volumes..."
docker compose down -v --remove-orphans
# `down -v` removes containers + volumes for the project but not images.

echo "→ starting fresh db..."
docker compose up -d db
for _ in $(seq 1 60); do
  state=$(docker inspect -f '{{.State.Health.Status}}' practicas-db-1 2>/dev/null || echo starting)
  [[ "$state" == healthy ]] && break
  sleep 1
done
if [[ "$state" != healthy ]]; then
  echo "✗ db never reached 'healthy' state — check 'docker compose logs db'" >&2
  exit 1
fi

echo "→ restoring database from $src/db.sql.gz..."
gunzip -c "$src/db.sql.gz" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null

echo "→ restoring uploads..."
# Create the volume by starting backend briefly so the named volume materialises.
docker compose up -d backend
sleep 2
docker compose stop backend
docker run --rm \
  -v practicas_uploads:/dst \
  -v "$PWD/$src":/src:ro \
  alpine:3.20 \
  sh -c 'cd /dst && find . -mindepth 1 -delete && tar xzf /src/uploads.tar.gz -C /dst'

echo "→ starting full stack..."
docker compose up -d

echo
echo "✓ restored from $src"
docker compose ps
