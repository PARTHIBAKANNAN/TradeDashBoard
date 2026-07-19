#!/usr/bin/env bash
# Redeploy script, run on the VM (by hand, or via the "Deploy to VM" GitHub
# Actions workflow over SSH — see .github/workflows/deploy.yml). That workflow
# already git-syncs before invoking this file, so it always runs the version
# just pulled from origin/main, never a stale copy.
#
# Safety model:
#   1. Validate the NEW code (backend import check + unit tests, frontend
#      build) BEFORE the live backend is ever stopped or the live frontend
#      build is replaced. A broken commit never takes down the running app.
#   2. Frontend swap is atomic (build to a staging dir, keep a backup of the
#      previous dist/, swap in one `mv`).
#   3. After restarting the backend, poll /api/health until it responds, and
#      confirm the FYERS session survived the restart (the token cache file
#      backend/.token_cache.json is untracked/gitignored, so `git reset --hard`
#      never touches it — this check catches any *other* way that could break).
#   4. Any failure after step 1 triggers an automatic rollback to the previous
#      commit + previous frontend build + previous backend deps, then exits
#      non-zero so the GitHub Actions run shows red.
set -euo pipefail

APP_DIR="/home/ubuntu/app"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
SERVICE="tradedashboard-backend"
HEALTH_URL="http://127.0.0.1:8000/api/health"
LOCK_FILE="/tmp/tradedashboard-deploy.lock"

cd "$APP_DIR"

log()  { echo "[deploy] $*"; }
warn() { echo "[deploy] WARN: $*" >&2; }

# Never let two deploys (e.g. a manual run + a CI run) race each other.
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "[deploy] ERROR: another deploy is already in progress (lock held on $LOCK_FILE)" >&2; exit 1; }

# Pulls one field out of a JSON blob on stdin; prints `default` on any parse
# error so callers never have to special-case "the server sent garbage".
json_field() {
  local field="$1" default="$2"
  python3 -c "
import json, sys
try:
    print(json.load(sys.stdin).get('$field', '$default'))
except Exception:
    print('$default')
"
}

health_snapshot() {
  curl -sf --max-time 5 "$HEALTH_URL" 2>/dev/null || echo '{}'
}

ROLLED_BACK=0
do_rollback() {
  if [ "$ROLLED_BACK" -eq 1 ]; then return; fi
  ROLLED_BACK=1
  warn "rolling back to $PREV_SHA"
  cd "$APP_DIR"
  git reset --hard "$PREV_SHA" || warn "git rollback failed — manual intervention needed"

  warn "reinstalling backend deps for the rolled-back commit"
  ( cd "$BACKEND_DIR" && source venv/bin/activate && pip install -q -r requirements.txt && deactivate ) \
    || warn "backend dep rollback failed"

  if [ -d "$FRONTEND_DIR/dist.prev" ]; then
    rm -rf "$FRONTEND_DIR/dist"
    mv "$FRONTEND_DIR/dist.prev" "$FRONTEND_DIR/dist"
    warn "frontend dist/ restored to the pre-deploy build"
  fi

  sudo systemctl restart "$SERVICE" || warn "backend restart during rollback failed"
  sleep 3
  if curl -sf --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    warn "rollback complete — backend is healthy again at $PREV_SHA"
  else
    warn "rollback restart did NOT come back healthy — needs a human: journalctl -u $SERVICE -n 100"
  fi
}

fail() {
  echo "[deploy] ERROR: $*" >&2
  do_rollback
  exit 1
}

on_unexpected_error() {
  echo "[deploy] ERROR: unexpected failure at line $1" >&2
  do_rollback
  exit 1
}
trap 'on_unexpected_error $LINENO' ERR

# ---- 0. Snapshot current state, for both rollback and the FYERS-continuity check ----
# PREV_SHA may already be set by the caller (the GitHub Actions workflow
# passes it in, captured before its own git reset moved HEAD — see
# .github/workflows/deploy.yml). Falls back to the working tree's current
# HEAD for a standalone/manual run, where this script's own reset below
# hasn't happened yet either.
PREV_SHA="${PREV_SHA:-$(git rev-parse HEAD)}"
log "current commit: $PREV_SHA"

PRE_HEALTH=$(health_snapshot)
PRE_AUTH=$(echo "$PRE_HEALTH" | json_field authenticated "unknown")
log "pre-deploy FYERS authenticated: $PRE_AUTH"

# ---- 1. Pull latest ----
log "fetching latest from origin/main"
git fetch origin main
NEW_SHA=$(git rev-parse origin/main)
git reset --hard origin/main
log "now at $NEW_SHA"

if [ "$PREV_SHA" = "$NEW_SHA" ]; then
  log "already up to date, nothing to deploy"
fi

# ---- 2. Backend: install deps + validate BEFORE touching the live process ----
log "backend: installing deps"
(
  cd "$BACKEND_DIR"
  source venv/bin/activate
  pip install -q -r requirements.txt
  deactivate
) || fail "backend dependency install failed"

log "backend: import validation"
(
  cd "$BACKEND_DIR"
  source venv/bin/activate
  python -c "import app.main; from fyers_apiv3 import fyersModel; from fyers_apiv3.FyersWebsocket import data_ws" 2>&1
  deactivate
) || fail "backend import check failed — new code never touched the live service"

log "backend: unit tests"
(
  cd "$BACKEND_DIR"
  source venv/bin/activate
  pip install -q pytest
  python -m pytest tests/ -q
  deactivate
) || fail "backend unit tests failed — new code never touched the live service"

# ---- 3. Frontend: build into a staging dir, validate, then atomic swap ----
log "frontend: installing deps + building"
(
  cd "$FRONTEND_DIR"
  npm ci --no-audit --no-fund
  rm -rf dist.new
  npm run build -- --outDir dist.new
) || fail "frontend build failed — live dist/ left untouched"

test -f "$FRONTEND_DIR/dist.new/index.html" || fail "frontend build did not produce dist.new/index.html"

rm -rf "$FRONTEND_DIR/dist.prev"
if [ -d "$FRONTEND_DIR/dist" ]; then
  mv "$FRONTEND_DIR/dist" "$FRONTEND_DIR/dist.prev"
fi
mv "$FRONTEND_DIR/dist.new" "$FRONTEND_DIR/dist"
log "frontend: new build swapped in (previous build kept at dist.prev until this deploy succeeds)"

# ---- 4. Backend: restart, then wait for it to actually come back healthy ----
log "backend: restarting $SERVICE"
sudo systemctl restart "$SERVICE" || fail "systemctl restart $SERVICE failed"

log "backend: waiting for /api/health"
HEALTHY=0
for i in $(seq 1 15); do
  if curl -sf --max-time 3 "$HEALTH_URL" > /tmp/tradedashboard-health-post.json 2>/dev/null; then
    HEALTHY=1
    break
  fi
  sleep 2
done
[ "$HEALTHY" -eq 1 ] || fail "backend did not become healthy within 30s of restart (journalctl -u $SERVICE)"

POST_HEALTH=$(cat /tmp/tradedashboard-health-post.json)
POST_STATUS=$(echo "$POST_HEALTH" | json_field status "unknown")
[ "$POST_STATUS" = "ok" ] || fail "post-deploy health status is '$POST_STATUS', not 'ok': $POST_HEALTH"

POST_AUTH=$(echo "$POST_HEALTH" | json_field authenticated "unknown")
log "post-deploy FYERS authenticated: $POST_AUTH"
if [ "$PRE_AUTH" = "True" ] && [ "$POST_AUTH" != "True" ]; then
  fail "FYERS was authenticated before this deploy but is NOT after the restart — the session was interrupted"
fi

# ---- 5. Reload Caddy (static config; a safe no-op unless the Caddyfile itself changed) ----
sudo systemctl reload caddy || fail "caddy reload failed"

# ---- success: drop the rollback trap, clean up the backup build ----
trap - ERR
rm -rf "$FRONTEND_DIR/dist.prev"
log "deploy complete: $PREV_SHA -> $NEW_SHA (FYERS authenticated: $POST_AUTH)"
