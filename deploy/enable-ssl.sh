#!/usr/bin/env bash
set -euo pipefail

# Enable HTTPS with Let's Encrypt for Voxis Nginx site.
# Usage:
#   DOMAIN=voxis.voxislabs.com EMAIL=you@example.com bash deploy/enable-ssl.sh

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
SITE_NAME="${SITE_NAME:-voxis}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Missing required variables."
  echo "Usage: DOMAIN=voxis.voxislabs.com EMAIL=you@example.com bash deploy/enable-ssl.sh"
  exit 1
fi

if [[ "$EUID" -eq 0 ]]; then
  echo "Run this script as a non-root sudo user."
  exit 1
fi

echo "[1/4] Installing Certbot"
sudo apt-get update -y
sudo apt-get install -y certbot python3-certbot-nginx

echo "[2/4] Ensuring Nginx site exists"
if [[ ! -f "/etc/nginx/sites-available/$SITE_NAME" ]]; then
  echo "Nginx site /etc/nginx/sites-available/$SITE_NAME not found."
  echo "Run deploy/setup-ubuntu.sh first, or set SITE_NAME appropriately."
  exit 1
fi

echo "[3/4] Requesting and installing certificate"
sudo certbot --nginx \
  -d "$DOMAIN" \
  -m "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  --redirect \
  --non-interactive

echo "[4/4] Validating renewal timer"
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo certbot renew --dry-run

echo
echo "HTTPS enabled for https://$DOMAIN"
