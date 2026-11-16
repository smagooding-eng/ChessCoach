#!/bin/sh
# Builds the website for the Cloudflare Worker. wrangler deploy runs this (the "build"
# setting in wrangler.jsonc), so a deploy works whatever Cloudflare's own build command is.
set -e
cd "$(dirname "$0")/.."
# Cloudflare's build step may already have built this commit
if [ -n "$WORKERS_CI" ] && [ -f artifacts/chess-coach/dist/public/index.html ]; then echo "Site already built"; exit 0; fi
[ -d node_modules ] || pnpm install --frozen-lockfile
export VITE_API_URL="${VITE_API_URL:-https://chesscoach-api-kbf8.onrender.com}"
pnpm --filter @workspace/chess-coach run build
