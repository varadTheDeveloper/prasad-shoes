#!/usr/bin/env bash
# =============================================================================
# Prasad Shoes – ONE-TIME server setup for a fresh AWS Lightsail Ubuntu 24.04 server.
# Puts Node.js API + PostgreSQL + Nginx (website + HTTPS) on the same machine.
#
# Run on the server as the "ubuntu" user:
#   bash setup-server.sh                      # uses <your-ip>.sslip.io as the web address (free, works with HTTPS)
#   bash setup-server.sh prasadshoes.in       # or your own domain (point its A record to the server IP first)
#
# Safe to run again: it skips what is already done and never overwrites passwords.
# =============================================================================
set -euo pipefail

APP_DIR=/opt/prasad-shoes
WEB_DIR=/var/www/prasad-shoes
BACKUP_DIR=/var/backups/prasad-shoes
CRED_FILE=$HOME/prasad-shoes-db-credentials.txt
DB=prasad_shoes

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

PUBLIC_IP=$(curl -fsS https://checkip.amazonaws.com | tr -d '[:space:]')
DOMAIN=${1:-$(echo "$PUBLIC_IP" | tr '.' '-').sslip.io}
EMAIL=${2:-}
say "Server IP: $PUBLIC_IP    Web address: https://$DOMAIN"

say "1/9  System updates, India time zone, swap"
sudo timedatectl set-timezone Asia/Kolkata
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y curl ca-certificates gnupg ufw unattended-upgrades openssl rsync
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

say "2/9  Firewall: only SSH, HTTP, HTTPS (PostgreSQL 5432 stays closed)"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full' 2>/dev/null || { sudo ufw allow 80/tcp; sudo ufw allow 443/tcp; }
sudo ufw --force enable

say "3/9  Node.js 24 LTS + PM2"
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v24" ]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2@latest

say "4/9  PostgreSQL 16 (listens on localhost only)"
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql

if [ ! -f "$CRED_FILE" ]; then
  OWNER_PW=$(openssl rand -hex 16)
  APP_PW=$(openssl rand -hex 16)
  JWT=$(openssl rand -hex 32)
  umask 077
  cat > "$CRED_FILE" <<EOF
# Prasad Shoes database logins – keep this file private.
# pgAdmin / DBeaver: use ps_owner (full access) through an SSH tunnel. See docs/GUIDE.md.
DB_NAME=$DB
OWNER_USER=ps_owner
OWNER_PASSWORD=$OWNER_PW
APP_USER=ps_app
APP_PASSWORD=$APP_PW
JWT_SECRET=$JWT
DOMAIN=$DOMAIN
EOF
fi
WANT_DOMAIN=$DOMAIN
# shellcheck disable=SC1090
source "$CRED_FILE"
DOMAIN=$WANT_DOMAIN   # the address given on this run wins over the saved one
sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" "$CRED_FILE"

sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ps_owner') THEN CREATE ROLE ps_owner LOGIN PASSWORD '$OWNER_PASSWORD'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ps_app')   THEN CREATE ROLE ps_app   LOGIN PASSWORD '$APP_PASSWORD';   END IF;
END \$\$;
SQL
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB'" | grep -q 1; then
  sudo -u postgres createdb -O ps_owner "$DB"
fi
sudo -u postgres psql -v ON_ERROR_STOP=1 -q -d "$DB" <<SQL
ALTER DATABASE $DB SET timezone TO 'Asia/Kolkata';
REVOKE ALL ON DATABASE $DB FROM PUBLIC;
GRANT CONNECT ON DATABASE $DB TO ps_app;
GRANT USAGE ON SCHEMA public TO ps_app;
-- The app user may read and write rows, but never DROP / ALTER tables.
ALTER DEFAULT PRIVILEGES FOR ROLE ps_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ps_app;
ALTER DEFAULT PRIVILEGES FOR ROLE ps_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ps_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ps_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ps_app;
SQL

say "5/9  Folders"
sudo mkdir -p "$APP_DIR/server" "$WEB_DIR" "$BACKUP_DIR"
sudo chown -R ubuntu:ubuntu "$APP_DIR" "$WEB_DIR"
sudo chown postgres:postgres "$BACKUP_DIR" && sudo chmod 750 "$BACKUP_DIR"
if [ ! -f "$WEB_DIR/index.html" ]; then
  echo '<!doctype html><title>Prasad Shoes</title><p style="font-family:sans-serif">Server is ready. Upload the app with deploy/upload.ps1.</p>' > "$WEB_DIR/index.html"
fi

say "6/9  API settings file ($APP_DIR/server/.env)"
if [ ! -f "$APP_DIR/server/.env" ]; then
  umask 077
  cat > "$APP_DIR/server/.env" <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://ps_app:$APP_PASSWORD@localhost:5432/$DB
MIGRATE_DATABASE_URL=postgres://ps_owner:$OWNER_PASSWORD@localhost:5432/$DB
JWT_SECRET=$JWT_SECRET
JWT_DAYS=7
EOF
fi

say "7/9  Nginx (website + /api) and HTTPS certificate"
sudo apt-get install -y nginx certbot python3-certbot-nginx
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
sed "s/__DOMAIN__/$DOMAIN/g" "$SCRIPT_DIR/nginx.conf" | sudo tee /etc/nginx/sites-available/prasad-shoes >/dev/null
sudo ln -sf /etc/nginx/sites-available/prasad-shoes /etc/nginx/sites-enabled/prasad-shoes
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
if [ -n "$EMAIL" ]; then CB_MAIL=(-m "$EMAIL"); else CB_MAIL=(--register-unsafely-without-email); fi
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos "${CB_MAIL[@]}" --redirect || \
  echo "!! HTTPS certificate failed. Check that port 80 is open in the Lightsail firewall (and the domain points here), then run: sudo certbot --nginx -d $DOMAIN"

say "8/9  Nightly backup at 1:00 am (keeps 14 days)"
sudo install -m 755 "$SCRIPT_DIR/backup.sh" /usr/local/bin/prasad-shoes-backup
echo "0 1 * * * postgres /usr/local/bin/prasad-shoes-backup" | sudo tee /etc/cron.d/prasad-shoes-backup >/dev/null

say "9/9  PM2 starts the API when the server reboots"
sudo env PATH="$PATH" pm2 startup systemd -u ubuntu --hp /home/ubuntu >/dev/null

cat <<EOF

------------------------------------------------------------------
 Server setup finished.
   Website / API address : https://$DOMAIN
   Database logins       : $CRED_FILE   (cat it to see the ps_owner password for pgAdmin)
 Next: on your Windows PC run deploy\\upload.ps1 to upload the app,
       then create the owner login (see docs/GUIDE.md, step 4).
------------------------------------------------------------------
EOF
