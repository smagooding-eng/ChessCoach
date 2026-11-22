#!/usr/bin/env bash
# Off-server copies of the backups in Cloudflare R2 (free up to 10 GB).
# Cloudflare → R2 → create bucket "chessscout-backups" → Manage API tokens → Object Read & Write.
set -euo pipefail
read -r -p "R2 Account ID: " ACC; read -r -p "Access Key ID: " KEY; read -r -s -p "Secret Access Key: " SEC; echo
rclone config create r2 s3 provider Cloudflare access_key_id "$KEY" secret_access_key "$SEC" endpoint "https://$ACC.r2.cloudflarestorage.com" acl private >/dev/null
rclone lsd r2:chessscout-backups >/dev/null && echo "R2 connected; the next hourly backup will be copied there."
