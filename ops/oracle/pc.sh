#!/usr/bin/env bash
# ChessScout on Oracle, from Git Bash on your PC:
#   bash ~/Desktop/ChessCoach/ops/oracle/pc.sh <command>
# (Run "git pull" in ~/Desktop/ChessCoach first so these scripts are current.)
#
#   key                  make your SSH key (paste the printed line into Oracle when creating the server)
#   setup <IP>           copy the scripts to the server and install everything (once)
#   env <file>           settings from Render (Environment → copy all → paste into a file); deleted after
#   alerts <ntfy-topic>  let the server's daily disk/backup check use your alert topic
#   deploy prod|preview  build and start a server (prod = main, preview = preview branch)
#   migrate              copy the database from Neon (practice any time; for real on move day)
#   refresh-preview      give preview a fresh copy of the live database
#   golive               move day: the Oracle live server takes over from Render
#   rollback prod|preview  previous version back
#   ci-key               key for automatic deploys from GitHub (prints what to paste)
#   r2                   off-server backup copies in Cloudflare R2
#   logs prod|preview    follow a server's log (Ctrl+C to stop)
#   status               what's running, disk, last backup
#   ssh                  a shell on the server
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
IPF=~/.chessscout-oracle-ip; KEY=~/.ssh/chessscout_oracle
ip() { [ -f "$IPF" ] && cat "$IPF" || { echo "Run: pc.sh setup <IP> first" >&2; exit 1; }; }
S() { ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$(ip)" "$@"; }
St() { ssh -t -i "$KEY" -o StrictHostKeyChecking=accept-new "ubuntu@$(ip)" "$@"; }
push_ops() {
  S "sudo mkdir -p /opt/chessscout/ops && sudo chown -R ubuntu:ubuntu /opt/chessscout"
  scp -q -i "$KEY" "$HERE"/*.sh "$HERE"/server.conf "ubuntu@$(ip):/opt/chessscout/ops/"
  S "sed -i 's/\r\$//' /opt/chessscout/ops/*.sh /opt/chessscout/ops/server.conf && chmod +x /opt/chessscout/ops/*.sh"
}
cmd=${1:-help}; shift || true
case "$cmd" in
  key)
    [ -f "$KEY" ] || ssh-keygen -t ed25519 -N "" -C "chessscout-oracle" -f "$KEY" >/dev/null
    echo "Paste this into Oracle (Add SSH keys → Paste public keys):"; cat "$KEY.pub";;
  setup)
    echo "${1:?usage: pc.sh setup <IP>}" > "$IPF"; push_ops; St "sudo bash /opt/chessscout/ops/01-setup.sh";;
  env)
    F=${1:?usage: pc.sh env <file>}; scp -q -i "$KEY" "$F" "ubuntu@$(ip):/tmp/render.env"
    S "bash /opt/chessscout/ops/apply-env.sh /tmp/render.env; shred -u /tmp/render.env"
    echo "Done. Delete $F from your PC now (it holds your secrets).";;
  alerts) S "echo NTFY_TOPIC=${1:?usage: pc.sh alerts <topic>} > /opt/chessscout/alerts.conf && chmod 600 /opt/chessscout/alerts.conf" && echo "Saved.";;
  deploy) push_ops; S "bash /opt/chessscout/ops/deploy.sh ${1:?prod or preview}";;
  migrate) push_ops; St "bash /opt/chessscout/ops/migrate.sh";;
  refresh-preview) St "bash /opt/chessscout/ops/refresh-preview.sh";;
  golive) push_ops; S "bash /opt/chessscout/ops/golive.sh";;
  rollback) S "bash /opt/chessscout/ops/rollback.sh ${1:?prod or preview}";;
  ci-key)
    CK=~/.ssh/chessscout_ci; [ -f "$CK" ] || ssh-keygen -t ed25519 -N "" -C "github-deploy" -f "$CK" >/dev/null
    # the key may only run ci-deploy.sh (no shell)
    S 'read -r k; grep -qF "$k" ~/.ssh/authorized_keys || echo "command=\"/opt/chessscout/ops/ci-deploy.sh\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty $k" >> ~/.ssh/authorized_keys' < "$CK.pub"
    echo; echo "GitHub → ChessCoach → Settings → Secrets and variables → Actions → New repository secret:"
    echo "  ORACLE_HOST = $(ip)"
    echo "  ORACLE_SSH_KEY = the private key (copied to your clipboard now):"
    (cat "$CK" | clip 2>/dev/null && echo "  (copied)") || cat "$CK";;
  r2) push_ops; St "bash /opt/chessscout/ops/r2-setup.sh";;
  logs) St "docker logs -f --tail 100 chessscout-${1:-prod}";;
  status) S "docker ps --format '{{.Names}}  {{.Image}}  {{.Status}}'; df -h / | tail -1; ls -1t /var/backups/chessscout/hourly 2>/dev/null | head -1; tail -1 /var/log/chessscout-backup.log 2>/dev/null";;
  ssh) St;;
  *) sed -n '2,22p' "$0";;
esac
