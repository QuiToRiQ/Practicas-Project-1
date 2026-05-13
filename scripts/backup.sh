#!/usr/bin/env bash
# Snapshot the database + uploaded files into ./backups/<timestamp>/.
# Safe to run while the stack is up — pg_dump takes a consistent snapshot.
#
# Retains the last N backups (default 14). Older ones are deleted automatically.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "✗ .env not found in $(pwd)" >&2
  exit 1
fi
set -o allexport; . ./.env; set +o allexport

: "${POSTGRES_USER:?missing POSTGRES_USER in .env}"
: "${POSTGRES_DB:?missing POSTGRES_DB in .env}"

retain="${BACKUP_RETAIN:-14}"
stamp="$(date +%Y-%m-%d_%H%M%S)"
out="backups/$stamp"
mkdir -p "$out"

echo "→ checking db container..."
if ! docker compose ps --status=running --services 2>/dev/null | grep -q '^db$'; then
  echo "  db is not running — starting it..."
  docker compose up -d db
  # Wait until healthy. The healthcheck in compose.yml uses pg_isready.
  for _ in $(seq 1 30); do
    state=$(docker inspect -f '{{.State.Health.Status}}' practicas-db-1 2>/dev/null || echo starting)
    [[ "$state" == healthy ]] && break
    sleep 1
  done
fi

echo "→ dumping database..."
docker compose exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges \
  | gzip > "$out/db.sql.gz"

echo "→ snapshotting uploads volume..."
# Use a throwaway alpine container that mounts the named volume read-only so
# this works regardless of whether the backend container is running.
if docker volume inspect practicas_uploads >/dev/null 2>&1; then
  docker run --rm \
    -v practicas_uploads:/src:ro \
    -v "$PWD/$out":/dst \
    alpine:3.20 \
    sh -c 'cd /src && tar czf /dst/uploads.tar.gz . 2>/dev/null || tar czf /dst/uploads.tar.gz -T /dev/null'
else
  echo "  uploads volume does not exist yet — skipping"
  tar czf "$out/uploads.tar.gz" -T /dev/null
fi

db_size=$(stat -c%s "$out/db.sql.gz")
up_size=$(stat -c%s "$out/uploads.tar.gz")
cat > "$out/manifest.json" <<EOF
{
  "timestamp": "$stamp",
  "db_bytes": $db_size,
  "uploads_bytes": $up_size,
  "postgres_user": "$POSTGRES_USER",
  "postgres_db":   "$POSTGRES_DB"
}
EOF

# Retention: keep the newest $retain, delete the rest.
mapfile -t old < <(ls -1d backups/*/ 2>/dev/null | sort | head -n -"$retain")
for d in "${old[@]:-}"; do
  [[ -n "$d" ]] && rm -rf "$d" && echo "  pruned old backup: $d"
done

human() { numfmt --to=iec --suffix=B --padding=8 "$1" 2>/dev/null || echo "$1 B"; }
echo
echo "✓ backup saved to $out"
echo "    db        $(human "$db_size")"
echo "    uploads   $(human "$up_size")"
