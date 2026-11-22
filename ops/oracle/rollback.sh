#!/usr/bin/env bash
# Put the previous version back:   bash rollback.sh prod   (or preview)
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf
ENV=${1:?usage: rollback.sh prod|preview}; PORT=$([ "$ENV" = prod ] && echo "$PROD_PORT" || echo "$PREVIEW_PORT")
CUR=$(docker inspect -f '{{.Config.Image}}' "chessscout-$ENV" 2>/dev/null || true)
PREV=$(docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' chessscout | grep ":$ENV-" | sort -k2 -r | awk '{print $1}' | grep -vx "$CUR" | head -1)
[ -n "$PREV" ] || { echo "No earlier version kept."; exit 1; }
docker rm -f "chessscout-$ENV" >/dev/null 2>&1 || true
docker run -d --name "chessscout-$ENV" --restart unless-stopped --network host --env-file "/opt/chessscout/$ENV.env" -e PORT="$PORT" "$PREV" \
  node --max-old-space-size="$NODE_HEAP_MB" --enable-source-maps artifacts/api-server/dist/index.mjs >/dev/null
echo "Rolled $ENV back from $CUR to $PREV"
