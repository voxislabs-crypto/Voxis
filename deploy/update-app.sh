#!/usr/bin/env bash
set -euo pipefail

# Quick maintenance script for Voxis.
# - Pull latest branch
# - Install deps
# - Build frontend
# - Restart PM2 backend
# Optional:
#   --backup-db : copy sqlite DB to backend/backups/
#   --reset-db  : remove sqlite DB and WAL/SHM files

APP_DIR="${APP_DIR:-/opt/voxis}"
BRANCH="${BRANCH:-clean-main}"
BACKEND_DIR="$APP_DIR/backend"
DB_FILE="$BACKEND_DIR/voxis.sqlite"
BACKUP_DIR="$BACKEND_DIR/backups"

DO_BACKUP=false
DO_RESET=false

for arg in "$@"; do
  case "$arg" in
    --backup-db) DO_BACKUP=true ;;
    --reset-db) DO_RESET=true ;;
    *)
      echo "Unknown flag: $arg"
      echo "Usage: $0 [--backup-db] [--reset-db]"
      exit 1
      ;;
  esac
done

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "App directory does not look like a git repo: $APP_DIR"
  exit 1
fi

echo "[1/6] Updating code"
git -C "$APP_DIR" fetch origin
git -C "$APP_DIR" checkout "$BRANCH"
git -C "$APP_DIR" pull --ff-only origin "$BRANCH"

if [[ "$DO_BACKUP" == true && -f "$DB_FILE" ]]; then
  echo "[2/6] Backing up database"
  mkdir -p "$BACKUP_DIR"
  ts="$(date +%Y%m%d-%H%M%S)"
  cp "$DB_FILE" "$BACKUP_DIR/voxis-$ts.sqlite"
  [[ -f "$DB_FILE-wal" ]] && cp "$DB_FILE-wal" "$BACKUP_DIR/voxis-$ts.sqlite-wal"
  [[ -f "$DB_FILE-shm" ]] && cp "$DB_FILE-shm" "$BACKUP_DIR/voxis-$ts.sqlite-shm"
fi

if [[ "$DO_RESET" == true ]]; then
  echo "[3/6] Resetting database files"
  rm -f "$DB_FILE" "$DB_FILE-wal" "$DB_FILE-shm"
fi

echo "[4/6] Installing dependencies"
npm --prefix "$APP_DIR" install

echo "[5/6] Building frontend"
npm --prefix "$APP_DIR" run build

echo "[6/6] Restarting backend"
pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --only voxis-backend
pm2 save

echo "Done."
echo "Backend health check: curl -fsS http://127.0.0.1:3101/health"
