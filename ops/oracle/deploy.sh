#!/usr/bin/env bash
# Build and (re)start one server:   bash deploy.sh prod    |   bash deploy.sh preview
# prod = main branch on port 8080 (api.chessscout.net); preview = preview branch on 8081.
# The new image is built while the old server keeps running; the switch itself takes a few
# seconds. If the new one doesn't pass its health check, the old one is put back.
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf
ENV=${1:-}; case "$ENV" in prod) BR=$PROD_BRANCH; PORT=$PROD_PORT;; preview) BR=$PREVIEW_BRANCH; PORT=$PREVIEW_PORT;; *) echo "usage: deploy.sh prod|preview"; exit 1;; esac
ENVFILE=/opt/chessscout/$ENV.env
[ -f "$ENVFILE" ] || { echo "Missing $ENVFILE (run pc.sh env first)"; exit 1; }
SRC=/opt/chessscout/src-$ENV
if [ ! -d "$SRC/.git" ]; then git clone --quiet "$REPO_URL" "$SRC"; fi
git -C "$SRC" fetch --quiet origin "$BR"
git -C "$SRC" reset --quiet --hard "origin/$BR"
SHA=$(git -C "$SRC" rev-parse --short HEAD)
IMG=chessscout:$ENV-$SHA
NAME=chessscout-$ENV

echo "== Building $ENV ($BR @ $SHA) — the current server keeps running meanwhile"
nice -n 10 docker build --quiet -f "$SRC/artifacts/api-server/Dockerfile" -t "$IMG" "$SRC" >/dev/null

OLD_IMG=$(docker inspect -f '{{.Config.Image}}' "$NAME" 2>/dev/null || true)
run() {
  docker run -d --name "$NAME" --restart unless-stopped --network host \
    --env-file "$ENVFILE" -e PORT="$PORT" "$1" \
    node --max-old-space-size="$NODE_HEAP_MB" --enable-source-maps artifacts/api-server/dist/index.mjs >/dev/null
}
healthy() { for _ in $(seq 1 45); do curl -fsS "http://127.0.0.1:$PORT/api/healthz" >/dev/null 2>&1 && return 0; sleep 2; done; return 1; }

echo "== Switching to $IMG"
docker rm -f "$NAME" >/dev/null 2>&1 || true
run "$IMG"
if healthy; then
  echo "== $ENV is up on $SHA"
  docker image prune -f >/dev/null
  # keep the last 3 images of this server for quick rollbacks
  docker images --format '{{.Repository}}:{{.Tag}} {{.CreatedAt}}' "chessscout" | grep ":$ENV-" | sort -k2 -r | awk 'NR>3{print $1}' | xargs -r docker rmi >/dev/null 2>&1 || true
else
  echo "!! $ENV didn't start; last log lines:"; docker logs --tail 40 "$NAME" || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [ -n "$OLD_IMG" ]; then echo "== Putting back $OLD_IMG"; run "$OLD_IMG"; healthy && echo "== Old version restored"; fi
  exit 1
fi
