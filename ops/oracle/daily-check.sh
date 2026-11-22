#!/usr/bin/env bash
# Once a day: warn (through the same ntfy alerts) if the disk is filling up or backups stopped.
set -uo pipefail
cd "$(dirname "$0")"; source ./server.conf
TOPIC=$(grep -s '^NTFY_TOPIC=' /opt/chessscout/alerts.conf | cut -d= -f2)
say() { echo "$1"; [ -n "$TOPIC" ] && curl -fsS -H "Title: ChessScout server" -H "Priority: high" -H "Tags: warning" -d "$1" "https://ntfy.sh/$TOPIC" >/dev/null || true; }
USE=$(df --output=pcent / | tail -1 | tr -dc 0-9); [ "$USE" -ge 80 ] && say "Disk is ${USE}% full on the Oracle server."
LAST=$(ls -1t /var/backups/chessscout/hourly/*.dump 2>/dev/null | head -1)
if [ -z "$LAST" ] || [ $(( $(date +%s) - $(stat -c %Y "$LAST") )) -gt 10800 ]; then say "No database backup in the last 3 hours."; fi
echo "$(date -u +%FT%TZ) check done (disk ${USE}%)"
