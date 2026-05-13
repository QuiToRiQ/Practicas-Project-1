#!/usr/bin/env bash
# Pretty-print available backups.
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ ! -d backups ]] || [[ -z "$(ls -A backups 2>/dev/null)" ]]; then
  echo "(no backups yet — run 'make backup' or 'scripts/backup.sh')"
  exit 0
fi

printf "%-22s  %10s  %10s\n" TIMESTAMP DB UPLOADS
printf "%-22s  %10s  %10s\n" ---------- -- -------
for d in $(ls -1d backups/*/ 2>/dev/null | sort); do
  d="${d%/}"
  stamp="$(basename "$d")"
  db_size=$(stat -c%s "$d/db.sql.gz" 2>/dev/null || echo 0)
  up_size=$(stat -c%s "$d/uploads.tar.gz" 2>/dev/null || echo 0)
  human() { numfmt --to=iec --suffix=B "$1" 2>/dev/null || echo "$1 B"; }
  printf "%-22s  %10s  %10s\n" "$stamp" "$(human "$db_size")" "$(human "$up_size")"
done
