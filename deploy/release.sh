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

# Website security headers (test report M5). Safe: anything that fails is put back and the release goes on.
update_nginx_headers() {
  local SNIP=/etc/nginx/snippets/prasad-shoes-headers.conf SITE=/etc/nginx/sites-available/prasad-shoes
  [ -f "$SITE" ] && sudo -n true 2>/dev/null || { echo "!! Skipped website headers (no nginx site or no sudo)"; return 0; }
  sudo cp -a "$SITE" /etc/nginx/prasad-shoes-site.bak
  [ -f "$SNIP" ] && sudo cp -a "$SNIP" /etc/nginx/prasad-shoes-headers.bak || sudo rm -f /etc/nginx/prasad-shoes-headers.bak
  sudo install -m 644 "$APP_DIR/deploy/nginx-headers.conf" "$SNIP"
  if ! sudo grep -q 'prasad-shoes-headers.conf' "$SITE"; then
    # older servers: add the include inside the two locations that have their own add_header
    sudo sed -i -E 's~^([[:space:]]*)add_header Cache-Control "(no-cache|public, immutable)";~&\n\1include snippets/prasad-shoes-headers.conf;~' "$SITE"
  fi
  if sudo nginx -t 2>/dev/null; then
    sudo systemctl reload nginx
    say "Website security headers are on"
  else
    sudo cp -a /etc/nginx/prasad-shoes-site.bak "$SITE"
    if [ -f /etc/nginx/prasad-shoes-headers.bak ]; then sudo cp -a /etc/nginx/prasad-shoes-headers.bak "$SNIP"; else sudo rm -f "$SNIP"; fi
    sudo nginx -t 2>/dev/null && sudo systemctl reload nginx
    echo "!! Website headers not changed: nginx refused the new settings (the old ones are back). Run: sudo nginx -t"
  fi
}
say "Website security headers"
update_nginx_headers

sleep 2
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then
  say "Done. API is healthy."
else
  echo "!! API did not answer. See logs: pm2 logs prasad-api --lines 50"
  exit 1
fi
rm -rf "$SRC"
