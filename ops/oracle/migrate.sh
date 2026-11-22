#!/usr/bin/env bash
# Copy the database from Neon into the live database here, then compare row counts.
#   bash migrate.sh            (asks for the Neon connection string; safe to run more than once)
# Do a practice run any time. On move day: stop Render first so nothing changes on Neon mid-copy.
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf; source /opt/chessscout/db.secret; source ./lib.sh
read -r -s -p "Neon connection string (Neon → Connect, 'postgresql://...'): " NEON; echo
NEON=${NEON/-pooler./.}                     # pg_dump needs the direct (non-pooled) host
LOCAL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_PROD"
D=/var/backups/chessscout/neon-$(date -u +%Y%m%d-%H%M).dump
echo "== Dumping Neon (a few minutes)"
pg_dump "$NEON" -Fc --no-owner --no-acl -f "$D"
echo "== Restoring into $DB_PROD (the live server here is stopped meanwhile)"
docker stop chessscout-prod >/dev/null 2>&1 || true
restore_into "$DB_PROD" "$D"
docker start chessscout-prod >/dev/null 2>&1 || true
echo "== Row counts, Neon vs here (exact)"
bad=0
printf "%-40s %12s %12s\n" table neon here
for t in $(psql "$LOCAL" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
  a=$(psql "$NEON" -Atc "SELECT count(*) FROM public.\"$t\"" 2>/dev/null || echo "?")
  b=$(psql "$LOCAL" -Atc "SELECT count(*) FROM public.\"$t\"")
  m=""; [ "$a" != "$b" ] && { m="  <- differs"; bad=$((bad+1)); }
  printf "%-40s %12s %12s%s\n" "$t" "$a" "$b" "$m"
done
[ "$bad" = 0 ] && echo "All tables match." || echo "$bad table(s) differ (expected on a practice run while Render is still live; on move day they should all match)."
