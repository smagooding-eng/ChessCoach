#!/usr/bin/env bash
# Give the preview server a fresh copy of the live database (e.g. before trying a release).
# The preview server never emails or notifies members (PREVIEW_MODE), so a real copy is safe to use.
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf; source /opt/chessscout/db.secret; source ./lib.sh
docker stop chessscout-preview >/dev/null 2>&1 || true
D=$(mktemp /tmp/live-XXXX.dump)
PGPASSWORD=$DB_PASSWORD pg_dump -h 127.0.0.1 -U "$DB_USER" -Fc "$DB_PROD" -f "$D"
sudo chown postgres "$D"
restore_into "$DB_PREVIEW" "$D"
sudo rm -f "$D"
docker start chessscout-preview >/dev/null 2>&1 || true
echo "Preview database refreshed from live."
