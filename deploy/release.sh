#!/usr/bin/env bash
# Installs a new version on the server. upload.ps1 runs this for you:
#   bash release.sh /tmp/ps-release      (folder with server/, shared/, deploy/, web/)
set -euo pipefail
SRC=${1:-/tmp/ps-release}
APP_DIR=/opt/prasad-shoes
WEB_DIR=/var/www/prasad-shoes

say() { printf '\033[1;34m==> %s\033[0m\n' "$*"; }

say "Copying code (keeping server/.env)"
mkdir -p "$APP_DIR"
rsync -a --delete --exclude '.env' --exclude 'node_modules' "$SRC/server/" "$APP_DIR/server/"
rsync -a --delete "$SRC/shared/" "$APP_DIR/shared/"
rsync -a --delete "$SRC/deploy/" "$APP_DIR/deploy/"

say "Installing and building the API"
cd "$APP_DIR/server"
npm ci --no-audit --no-fund
npm run build
say "Updating the database (migrations)"
npm run migrate
npm prune --omit=dev --no-audit --no-fund

say "Restarting the API"
pm2 startOrReload "$APP_DIR/deploy/ecosystem.config.js" --update-env
pm2 save

if [ -f "$SRC/web/index.html" ]; then
  say "Publishing the website"
  rsync -a --delete "$SRC/web/" "$WEB_DIR/"
fi

sleep 2
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  say "Done. API is healthy."
else
  echo "!! API did not answer. See logs: pm2 logs prasad-api --lines 50"
  exit 1
fi
rm -rf "$SRC"
