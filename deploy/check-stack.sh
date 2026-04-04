#!/usr/bin/env bash
set -euo pipefail

# Quick server verification helper.
# Usage:
#   bash deploy/check-stack.sh voxis.voxislabs.com

DOMAIN="${1:-voxis.voxislabs.com}"
BACKEND_HEALTH_URL="${BACKEND_HEALTH_URL:-http://127.0.0.1:3101/health}"

echo "== Nginx config test =="
sudo nginx -t

echo
echo "== PM2 processes =="
pm2 status

echo
echo "== Local backend health =="
curl -fsS "$BACKEND_HEALTH_URL"
echo

echo
echo "== Public HTTPS check =="
curl -I "https://$DOMAIN" | head -n 5

echo
echo "== Public health endpoint =="
curl -fsS "https://$DOMAIN/health"
echo

echo
echo "Checks completed."
