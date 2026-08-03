# Builds and runs @workspace/api-server as a standalone Docker image, for
# deployment to Render (or any other Docker-capable host).
#
# This replaces what replit.nix used to provide (Node 24, Stockfish, and
# Replit's managed runtime). Stockfish and ffmpeg are installed here via apt
# instead of Nix; everything else is a standard pnpm-workspace build.
#
# Build context MUST be the repo root (this is a pnpm workspace and
# api-server depends on sibling packages under lib/*):
#
#   docker build -f artifacts/api-server/Dockerfile -t chesscoach-api .
#
FROM node:24-bookworm-slim

# Stockfish: chess engine, invoked via child_process.spawn("stockfish").
# ffmpeg: used by the audio integration to transcode voice-chat input to WAV.
RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Sanity check that stockfish is on PATH at build time (fails fast if the
# apt package layout ever changes instead of failing at runtime).
RUN command -v stockfish

RUN corepack enable

WORKDIR /repo

# Copying the whole workspace (rather than a subset) so pnpm can correctly
# resolve the full dependency graph declared in pnpm-lock.yaml.
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server run build

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
