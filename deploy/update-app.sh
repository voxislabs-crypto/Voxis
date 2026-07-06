#!/usr/bin/env bash
set -euo pipefail

# Quick maintenance script for Voxis.
# - Pull latest branch
# - Install deps
# - Optional: preload Kokoro model cache
# - Build frontend
# - Restart PM2 backend
# Optional:
#   --backup-db : copy sqlite DB to backend/backups/
#   --reset-db  : remove sqlite DB and WAL/SHM files
#   --preload-kokoro : pre-download Kokoro model cache on server

APP_DIR="${APP_DIR:-/opt/voxis}"
BRANCH="${BRANCH:-NeuronMap}"
PM2_APP_NAME="${PM2_APP_NAME:-voxis-backend}"
APP_NAME="${APP_NAME:-voxis}"
BACKEND_DIR="$APP_DIR/backend"
DB_FILE="$BACKEND_DIR/voxis.sqlite"
BACKUP_DIR="$BACKEND_DIR/backups"

DO_BACKUP=false
DO_RESET=false
DO_PRELOAD_KOKORO=false

for arg in "$@"; do
  case "$arg" in
    --backup-db) DO_BACKUP=true ;;
    --reset-db) DO_RESET=true ;;
    --preload-kokoro) DO_PRELOAD_KOKORO=true ;;
    *)
      echo "Unknown flag: $arg"
      echo "Usage: $0 [--backup-db] [--reset-db] [--preload-kokoro]"
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
# Discard tracked modifications and remove untracked files that would block checkout
git -C "$APP_DIR" checkout -- . 2>/dev/null || true
git -C "$APP_DIR" clean -fd --exclude=frontend/.env --exclude=backend/.env 2>/dev/null || true
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

if [[ "$DO_PRELOAD_KOKORO" == true ]]; then
  echo "[4c/6] Preloading Kokoro model cache"
  bash "$APP_DIR/deploy/preload-kokoro-model.sh"
fi

echo "[4b/6] Ensuring prosody tools are installed"
if ! command -v yt-dlp >/dev/null 2>&1 || ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y yt-dlp ffmpeg
fi

FRONTEND_ENV="$APP_DIR/frontend/.env"
if [[ ! -f "$FRONTEND_ENV" ]]; then
  cp "$APP_DIR/frontend/.env.example" "$FRONTEND_ENV"
fi

# Keep frontend publishable key aligned with backend when only backend/.env was updated.
if grep -q '^CLERK_PUBLISHABLE_KEY=pk_' "$BACKEND_DIR/.env" 2>/dev/null; then
  backend_pk="$(grep '^CLERK_PUBLISHABLE_KEY=' "$BACKEND_DIR/.env" | head -n1 | cut -d= -f2-)"
  if [[ -n "$backend_pk" ]]; then
    if grep -q '^VITE_CLERK_PUBLISHABLE_KEY=' "$FRONTEND_ENV" 2>/dev/null; then
      sed -i "s|^VITE_CLERK_PUBLISHABLE_KEY=.*|VITE_CLERK_PUBLISHABLE_KEY=${backend_pk}|" "$FRONTEND_ENV"
    else
      echo "VITE_CLERK_PUBLISHABLE_KEY=${backend_pk}" >> "$FRONTEND_ENV"
    fi
  fi
fi

if ! grep -q '^VITE_CLERK_PUBLISHABLE_KEY=pk_' "$FRONTEND_ENV" 2>/dev/null; then
  echo
  echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY is not set in $FRONTEND_ENV"
  echo "Edit backend/.env (CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY) or frontend/.env, then re-run."
  echo "  nano $BACKEND_DIR/.env"
  echo "  nano $FRONTEND_ENV"
  exit 1
fi

if grep -q '^ALLOW_MISSING_CLERK_KEYS=true' "$BACKEND_DIR/.env" 2>/dev/null; then
  echo
  echo "WARNING: ALLOW_MISSING_CLERK_KEYS=true is set in backend/.env."
  echo "Remove it (or set false) in production so friends must sign in with Clerk/Google."
fi

echo "[5/6] Building frontend"
# Fix ownership if dist/ was previously built by root (causes EACCES on unlink)
if [[ -d "$APP_DIR/frontend/dist" ]]; then
  sudo chown -R "$(id -u):$(id -g)" "$APP_DIR/frontend/dist" 2>/dev/null || true
fi
npm --prefix "$APP_DIR" run build

echo "[6/6] Restarting backend"
export VOXIS_GIT_SHA="$(git -C "$APP_DIR" rev-parse --short HEAD)"
export VOXIS_BRANCH="$BRANCH"
export PM2_APP_NAME

# Source backend/.env into the current shell so PM2 picks up every variable,
# including TTS_ENGINE. PM2 does NOT read .env files itself — it inherits only
# what is already in the launching shell's environment.
if [[ -f "$BACKEND_DIR/.env" ]]; then
  echo "  Sourcing backend/.env into shell environment"
  set -o allexport
  # shellcheck source=/dev/null
  source "$BACKEND_DIR/.env"
  set +o allexport
fi

if [[ -f "$APP_DIR/ecosystem.config.cjs" ]]; then
  pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --only "$PM2_APP_NAME" --update-env
else
  pm2 restart "$PM2_APP_NAME" --update-env
fi
pm2 save

NGINX_SITE="/etc/nginx/sites-available/$APP_NAME"
if [[ -f "$NGINX_SITE" ]]; then
  if ! grep -q 'personality-preference' "$NGINX_SITE" || ! grep -q '(api|' "$NGINX_SITE"; then
    echo
    echo "WARNING: nginx site $NGINX_SITE is missing newer API proxy routes."
    echo "Production may miss preferences, loops, SFX, and other newer frontend-backed features."
    echo "Update the nginx site from deploy/setup-ubuntu.sh, then run:"
    echo "  sudo nginx -t && sudo systemctl reload nginx"
  fi
fi

echo "Done."
echo "Backend health check: curl -fsS http://127.0.0.1:3101/health"
