#!/usr/bin/env bash
# Hourly backup of the live database (cron, see 01-setup.sh). Keeps 48 hourly + 14 daily copies
# here, and copies each one to Cloudflare R2 when an "r2" rclone remote exists (r2-setup.sh).
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf; source /opt/chessscout/db.secret
DIR=/var/backups/chessscout; mkdir -p "$DIR/hourly" "$DIR/daily"
F="$DIR/hourly/$DB_PROD-$(date -u +%Y%m%d-%H%M).dump"
PGPASSWORD=$DB_PASSWORD pg_dump -h 127.0.0.1 -U "$DB_USER" -Fc "$DB_PROD" > "$F.tmp" && mv "$F.tmp" "$F"
[ "$(date -u +%H)" = "06" ] && cp "$F" "$DIR/daily/"
ls -1t "$DIR"/hourly/*.dump | tail -n +49 | xargs -r rm -f
ls -1t "$DIR"/daily/*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
if rclone listremotes 2>/dev/null | grep -q '^r2:'; then
  rclone copy --quiet "$F" r2:chessscout-backups/hourly/ && rclone delete --quiet --min-age 14d r2:chessscout-backups/hourly/ || echo "R2 copy failed"
fi
echo "$(date -u +%FT%TZ) backup ok $(du -h "$F" | cut -f1)"
