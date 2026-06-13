#!/usr/bin/env bash
# WAL-safe online backup of the SQLite database, gzipped with rotation.
# Run from host cron, e.g.:  0 3 * * *  /path/to/scripts/backup-sqlite.sh
set -euo pipefail

DB_PATH="${DB_PATH:-./data/akpoker.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP="${KEEP:-14}" # keep this many most-recent backups

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/akpoker-$STAMP.sqlite"

# .backup performs a consistent online copy even with WAL active.
sqlite3 "$DB_PATH" ".backup '$OUT'"
gzip -f "$OUT"
echo "backup -> $OUT.gz"

# Rotation: delete oldest beyond KEEP.
ls -1t "$BACKUP_DIR"/akpoker-*.sqlite.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
