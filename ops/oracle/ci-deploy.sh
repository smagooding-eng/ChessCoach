#!/usr/bin/env bash
# What GitHub Actions is allowed to run here (its key is locked to this script):
# "prod" after a push to main, "preview" after a push to preview.
set -euo pipefail
ENV=${SSH_ORIGINAL_COMMAND:-}
case "$ENV" in prod|preview) ;; *) echo "only 'prod' or 'preview'"; exit 1;; esac
OPS=/opt/chessscout/ops
bash "$OPS/deploy.sh" "$ENV"
# keep these scripts in step with the live branch
if [ "$ENV" = prod ] && [ -d /opt/chessscout/src-prod/ops/oracle ]; then
  rsync -a --exclude ci-deploy.sh /opt/chessscout/src-prod/ops/oracle/ "$OPS/"
fi
