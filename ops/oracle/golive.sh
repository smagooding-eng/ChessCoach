#!/usr/bin/env bash
# Move day: the Oracle live server takes over (emails, notifications, game polling, Lichess bot).
set -euo pipefail
cd "$(dirname "$0")"
touch /opt/chessscout/LIVE
sed -i -E '/^(CS_STANDBY|PREVIEW_MODE|PREVIEW_ALLOW_EMAILS)=/d' /opt/chessscout/prod.env
bash deploy.sh prod
echo "Live server is now fully on."
