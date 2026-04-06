#!/usr/bin/env bash
set -euo pipefail

# Voxis Ubuntu bootstrap script.
# Installs system deps, Node.js, PM2, Nginx, clones/updates repo,
# builds frontend, runs backend under PM2, and configures Nginx reverse proxy.

APP_NAME="voxis"
REPO_URL="${REPO_URL:-https://github.com/voxislabs-crypto/Voxis.git}"
BRANCH="${BRANCH:-clean-main}"
APP_DIR="${APP_DIR:-/opt/voxis}"
BACKEND_PORT="${BACKEND_PORT:-3101}"
SERVER_NAME="${SERVER_NAME:-_}"
RUN_AS_USER="${RUN_AS_USER:-$USER}"

if [[ "$EUID" -eq 0 ]]; then
  echo "Run this script as a non-root sudo user."
  exit 1
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

echo "[1/9] Installing Ubuntu packages"
sudo apt-get update -y
sudo apt-get install -y \
  ca-certificates \
  curl \
  git \
  gnupg \
  build-essential \
  nginx

echo "[2/9] Installing Node.js 20 if needed"
if ! need_cmd node || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "[3/9] Installing PM2"
if ! need_cmd pm2; then
  sudo npm install -g pm2
fi

echo "[4/9] Cloning or updating app"
sudo mkdir -p "$(dirname "$APP_DIR")"
sudo chown -R "$RUN_AS_USER":"$RUN_AS_USER" "$(dirname "$APP_DIR")"

if [[ -d "$APP_DIR/.git" ]]; then
  git -C "$APP_DIR" fetch origin
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone "$REPO_URL" "$APP_DIR"
  git -C "$APP_DIR" checkout "$BRANCH"
fi

echo "[5/9] Installing dependencies"
npm --prefix "$APP_DIR" install

echo "[6/9] Preparing backend environment"
if [[ ! -f "$APP_DIR/backend/.env" ]]; then
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  sed -i "s/^PORT=.*/PORT=$BACKEND_PORT/" "$APP_DIR/backend/.env"
  echo "Created backend/.env from example. Fill in API keys before production use."
else
  if grep -q '^PORT=' "$APP_DIR/backend/.env"; then
    sed -i "s/^PORT=.*/PORT=$BACKEND_PORT/" "$APP_DIR/backend/.env"
  else
    echo "PORT=$BACKEND_PORT" >> "$APP_DIR/backend/.env"
  fi
fi

echo "[6b/9] Preparing frontend environment"
if [[ ! -f "$APP_DIR/frontend/.env" ]]; then
  cp "$APP_DIR/frontend/.env.example" "$APP_DIR/frontend/.env"
  echo
  echo "IMPORTANT: frontend/.env was created from the example."
  echo "You must set VITE_CLERK_PUBLISHABLE_KEY before the build will work:"
  echo "  nano $APP_DIR/frontend/.env"
  echo "Get your key from: https://dashboard.clerk.com → API Keys → Publishable key"
  echo "Then re-run this script or run: bash deploy/update-app.sh"
  echo
fi

if ! grep -q '^VITE_CLERK_PUBLISHABLE_KEY=pk_' "$APP_DIR/frontend/.env" 2>/dev/null; then
  echo
  echo "ERROR: VITE_CLERK_PUBLISHABLE_KEY is not set in $APP_DIR/frontend/.env"
  echo "Edit the file and add your Clerk publishable key, then re-run this script."
  echo "  nano $APP_DIR/frontend/.env"
  exit 1
fi

echo "[7/9] Building frontend"
npm --prefix "$APP_DIR" run build

echo "[8/9] Configuring PM2"
cat > "$APP_DIR/ecosystem.config.cjs" <<EOF
module.exports = {
  apps: [
    {
      name: "voxis-backend",
      cwd: "$APP_DIR/backend",
      script: "server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: "$BACKEND_PORT"
      }
    }
  ]
};
EOF

pm2 startOrReload "$APP_DIR/ecosystem.config.cjs" --only voxis-backend
pm2 save

set +e
pm2 startup systemd -u "$RUN_AS_USER" --hp "$HOME" >/tmp/pm2-startup.txt 2>&1
PM2_STARTUP_EXIT=$?
set -e
if [[ "$PM2_STARTUP_EXIT" -ne 0 ]]; then
  echo "PM2 startup command may need manual sudo execution:"
  grep -E "sudo .*pm2 startup" /tmp/pm2-startup.txt || true
fi

echo "[9/9] Configuring Nginx"
sudo tee /etc/nginx/sites-available/$APP_NAME >/dev/null <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAME;

    root $APP_DIR/frontend/dist;
    index index.html;

    # Regex API matcher: proxies backend endpoints to Express on $BACKEND_PORT.
    location ~ ^/(health|chat|settings|me|users|personality|personalities|research-profile|memory|tts|voice-presets)(/|$) {
        proxy_pass http://127.0.0.1:$BACKEND_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Required for streaming AI responses (SSE / chunked transfer)
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        add_header X-Accel-Buffering no;
    }

    location / {
        try_files \$uri /index.html;
    }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/$APP_NAME
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  sudo rm -f /etc/nginx/sites-enabled/default
fi

sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx

echo
echo "Voxis setup complete."
echo "App directory: $APP_DIR"
echo "Frontend URL: http://$SERVER_NAME"
echo "Backend health: http://$SERVER_NAME/health"
echo "PM2 status: pm2 status"
