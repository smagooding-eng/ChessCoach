#!/usr/bin/env bash
# Run once on a fresh Oracle Ubuntu 24.04 (ARM) server, as the ubuntu user, from /opt/chessscout/ops:
#   sudo bash 01-setup.sh
# Installs: security updates, firewall ports 80/443, fail2ban, Docker, Postgres, Caddy (HTTPS),
# the two databases (live + preview), hourly backups, and a daily disk/backup check.
set -euo pipefail
cd "$(dirname "$0")"; source ./server.conf
[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== System updates, automatic security updates, fail2ban"
apt-get update -y && apt-get upgrade -y
apt-get install -y unattended-upgrades fail2ban ca-certificates curl gnupg git jq rclone iptables-persistent
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Firewall: open 80 and 443 (Oracle's Ubuntu image only allows 22)"
for p in 80 443; do
  if ! iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null; then
    N=$(iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')   # just above Oracle's catch-all reject
    iptables -I INPUT "${N:-1}" -p tcp --dport $p -m state --state NEW -j ACCEPT
  fi
done
netfilter-persistent save

echo "== Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin
fi
usermod -aG docker ubuntu
# keep logs and old images from filling the disk
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
JSON
systemctl restart docker

echo "== Postgres $PG_MAJOR"
if ! command -v psql >/dev/null || ! psql --version | grep -q " $PG_MAJOR\."; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release; echo "$VERSION_CODENAME")-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y && apt-get install -y "postgresql-$PG_MAJOR"
fi
CONF="/etc/postgresql/$PG_MAJOR/main/conf.d/chessscout.conf"
cat > "$CONF" <<PGC
# tuned for a 12 GB machine shared with the app
listen_addresses = 'localhost'
max_connections = 120
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 16MB
maintenance_work_mem = 512MB
wal_compression = on
random_page_cost = 1.1
PGC
systemctl restart postgresql

mkdir -p /opt/chessscout && chown ubuntu:ubuntu /opt/chessscout
SECRETS=/opt/chessscout/db.secret
if [ ! -f "$SECRETS" ]; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$PW'"
  echo "DB_PASSWORD=$PW" > "$SECRETS"; chmod 600 "$SECRETS"; chown ubuntu:ubuntu "$SECRETS"
fi
for d in "$DB_PROD" "$DB_PREVIEW"; do
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$d'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$d"
done

echo "== Caddy (HTTPS for $API_DOMAIN and $PREVIEW_API_DOMAIN)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<CADDY
$API_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:$PROD_PORT {
    health_uri /api/healthz
    lb_try_duration 20s
  }
}
$PREVIEW_API_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:$PREVIEW_PORT
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "== Hourly database backups + daily health check"
install -d -o ubuntu -g ubuntu /var/backups/chessscout
cat > /etc/cron.d/chessscout <<CRON
SHELL=/bin/bash
7 * * * * ubuntu /opt/chessscout/ops/backup.sh >> /var/log/chessscout-backup.log 2>&1
30 6 * * * ubuntu /opt/chessscout/ops/daily-check.sh >> /var/log/chessscout-check.log 2>&1
CRON
touch /var/log/chessscout-backup.log /var/log/chessscout-check.log; chown ubuntu:ubuntu /var/log/chessscout-*.log

echo
echo "Done. Next (from your PC): pc.sh env <file>, then pc.sh deploy preview (a test build), then pc.sh migrate."
