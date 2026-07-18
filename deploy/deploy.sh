#!/usr/bin/env bash
# Redeploy script, run on the VM (by hand or via the "Deploy to VM" GitHub Actions
# workflow over SSH). Resets the working tree to origin/main so it never blocks
# on local drift, rebuilds the frontend, reinstalls backend deps, and restarts
# the systemd-managed backend service.
set -euo pipefail

cd /home/ubuntu/app

echo "==> git pull"
git fetch origin main
git reset --hard origin/main

echo "==> backend deps"
cd backend
source venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ..

echo "==> frontend build"
cd frontend
npm ci --no-audit --no-fund
npm run build
cd ..

echo "==> restart backend"
sudo systemctl restart tradedashboard-backend

echo "==> reload caddy (static files are picked up automatically; reload is a safe no-op)"
sudo systemctl reload caddy

echo "==> deploy complete"
