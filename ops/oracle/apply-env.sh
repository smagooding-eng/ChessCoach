#!/usr/bin/env bash
# Turn Render's environment variables (a KEY=VALUE file) into the two server settings files:
#   /opt/chessscout/prod.env     the live server
#   /opt/chessscout/preview.env  the preview server: preview database, PREVIEW_MODE (no emails or
#                                notifications to members), Stripe TEST keys if given, no Lichess bot
# For the preview's Stripe, add STRIPE_TEST_SECRET_KEY / STRIPE_TEST_PUBLISHABLE_KEY /
# STRIPE_TEST_WEBHOOK_SECRET lines to the file; without them the preview has no Stripe.
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf; source /opt/chessscout/db.secret
IN=${1:?usage: apply-env.sh <render-env-file>}
clean() { sed -e 's/\r$//' -e '/^\s*#/d' -e '/^\s*$/d' "$IN" | grep -vE '^(DATABASE_URL|PORT|NODE_ENV|RENDER[A-Z_]*|PUBLIC_APP_URL|API_PUBLIC_URL|PREVIEW_[A-Z_]*|STRIPE_TEST_[A-Z_]*)=' || true; }
val() { sed -e 's/\r$//' "$IN" | grep -E "^$1=" | head -1 | cut -d= -f2- || true; }
umask 077
{
  clean
  echo "NODE_ENV=production"
  echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_PROD"
  echo "PUBLIC_APP_URL=https://$API_DOMAIN"
  echo "API_PUBLIC_URL=https://$API_DOMAIN"
  # Standby until move day: behaves like preview (no emails / notifications to members, no Lichess
  # bot, no game polling) so it can't double up with Render. "pc.sh golive" removes these two lines.
  [ -f /opt/chessscout/LIVE ] || { echo "CS_STANDBY=1"; echo "PREVIEW_MODE=1"; echo "PREVIEW_ALLOW_EMAILS=$ADMIN_EMAIL"; }
} > /opt/chessscout/prod.env
{
  clean | grep -vE '^(STRIPE_SECRET_KEY|STRIPE_PUBLISHABLE_KEY|STRIPE_WEBHOOK_SECRET|LICHESS_BOT_TOKEN|CORS_ORIGIN|LIVE_WS_ALLOWED_ORIGINS)=' || true
  echo "NODE_ENV=production"
  echo "PREVIEW_MODE=1"
  echo "PREVIEW_ALLOW_EMAILS=$ADMIN_EMAIL"
  echo "DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_PREVIEW"
  echo "PUBLIC_APP_URL=https://$PREVIEW_API_DOMAIN"
  echo "API_PUBLIC_URL=https://$PREVIEW_API_DOMAIN"
  echo "CORS_ORIGIN=$PREVIEW_SITE"
  echo "LIVE_WS_ALLOWED_ORIGINS=$PREVIEW_SITE"
  T=$(val STRIPE_TEST_SECRET_KEY); [ -n "$T" ] && echo "STRIPE_SECRET_KEY=$T"
  T=$(val STRIPE_TEST_PUBLISHABLE_KEY); [ -n "$T" ] && echo "STRIPE_PUBLISHABLE_KEY=$T"
  T=$(val STRIPE_TEST_WEBHOOK_SECRET); [ -n "$T" ] && echo "STRIPE_WEBHOOK_SECRET=$T"
  true
} > /opt/chessscout/preview.env
chown ubuntu:ubuntu /opt/chessscout/prod.env /opt/chessscout/preview.env 2>/dev/null || true
echo "Wrote prod.env ($(wc -l < /opt/chessscout/prod.env) settings) and preview.env ($(wc -l < /opt/chessscout/preview.env))."
grep -q '^CORS_ORIGIN=' /opt/chessscout/prod.env || echo "Note: CORS_ORIGIN isn't in the file; the live server needs CORS_ORIGIN=$SITE"
