#!/usr/bin/env bash
# Nightly database backup (runs as the postgres user from /etc/cron.d/prasad-shoes-backup).
# Restore a backup:  sudo -u postgres pg_restore --clean --if-exists -d prasad_shoes /var/backups/prasad-shoes/<file>.dump
set -euo pipefail
DIR=/var/backups/prasad-shoes
FILE="$DIR/prasad_shoes-$(date +%Y-%m-%d_%H%M).dump"
pg_dump -Fc prasad_shoes > "$FILE"
find "$DIR" -name 'prasad_shoes-*.dump' -mtime +14 -delete
echo "Backup written: $FILE"
