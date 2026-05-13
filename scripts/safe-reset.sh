#!/usr/bin/env bash
# Take a backup, then wipe and rebuild the stack from scratch.
# Use this instead of `docker compose down -v` so you never lose data by accident.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ taking safety backup first..."
./scripts/backup.sh

echo
echo "→ wiping volumes and rebuilding..."
docker compose down -v --remove-orphans
docker compose up --build -d

echo
echo "✓ stack rebuilt from scratch. If you need the previous data, run:"
echo "    make restore     # restores the backup taken at the start of this run"
