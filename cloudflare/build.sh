#!/bin/sh
# Builds the website for the Cloudflare Worker. wrangler deploy runs this (the "build"
# setting in wrangler.jsonc), so a deploy works whatever Cloudflare's own build command is.
set -e
cd "$(dirname "$0")/.."
# Cloudflare's build step may already have built this commit
if [ -n "$WORKERS_CI" ] && [ -f artifacts/chess-coach/dist/public/index.html ]; then echo "Site already built"; exit 0; fi
[ -d node_modules ] || pnpm install --frozen-lockfile
# The live API. One place to change it on move day (or set VITE_API_URL in Cloudflare's build settings).
LIVE_API="https://chesscoach-api-kbf8.onrender.com"
if [ "$WORKERS_CI_BRANCH" = "preview" ]; then
  # preview.chessscout.net (the chesscoach-preview Worker, built from the preview branch):
  # the preview API once it exists (PREVIEW_API_URL in that Worker's build settings), else the live one
  export VITE_API_URL="${PREVIEW_API_URL:-$LIVE_API}"
else
  export VITE_API_URL="${VITE_API_URL:-$LIVE_API}"
fi
echo "Building the site for API $VITE_API_URL (branch ${WORKERS_CI_BRANCH:-local})"
pnpm --filter @workspace/chess-coach run build
