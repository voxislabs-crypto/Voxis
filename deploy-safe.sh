#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/voxis}"
BRANCH="${BRANCH:-NeuronMap}"
PM2_APP_NAME="${PM2_APP_NAME:-voxis-backend}"
STASH_NAME="Pre-deploy auto-stash $(date +%Y-%m-%d_%H-%M-%S)"
STASH_CREATED=0

echo "=== Safe Voxis Deploy Started ==="
echo "App dir: ${APP_DIR}"
echo "Branch: ${BRANCH}"

cd "${APP_DIR}"

echo "→ Fetching latest changes..."
git fetch origin

echo "→ Stashing any local changes (including untracked files)..."
if git stash push -u -m "${STASH_NAME}" | grep -qv "No local changes to save"; then
	STASH_CREATED=1
fi

echo "→ Checking out ${BRANCH}..."
git checkout "${BRANCH}" 2>/dev/null || git checkout -b "${BRANCH}" "origin/${BRANCH}"

echo "→ Pulling latest code..."
git pull origin "${BRANCH}" --ff-only || git pull origin "${BRANCH}" --rebase

echo "→ Installing dependencies..."
npm install

echo "→ Building frontend..."
npm run build

echo "→ Restarting backend..."
pm2 restart "${PM2_APP_NAME}"

echo "→ Reloading nginx..."
sudo systemctl reload nginx

if [[ "${STASH_CREATED}" -eq 1 ]]; then
	echo "→ Cleaning up deploy stash..."
	git stash list | grep -F "${STASH_NAME}" >/dev/null && git stash drop "stash^{/${STASH_NAME}}" || true
fi

echo "=== Safe Voxis Deploy Completed Successfully ==="