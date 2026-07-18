# Deploying TradeDashboard on Oracle Cloud (Mumbai) — free, always-on

This moves the backend off your corporate machine (where Zscaler blocks FYERS REST) onto a free
Oracle Cloud VM whose outbound traffic reaches FYERS directly. Cost: **₹0** (Always-Free VM + DuckDNS +
Caddy/Let's Encrypt). Your laptop only needs **SSH** (built into Windows 11 PowerShell) and a browser.

Two deploy paths: **venv + systemd (primary, no Docker)** and **Docker (optional)**. Use the venv path.

---

## Phase 0 — De-risk first (proves REST works off-Zscaler)

Before doing the full setup, confirm the premise on the VM:
```bash
cd /opt/tradedash/backend
.venv/bin/python manual_auth.py     # one-time browser consent (new redirect URI)
.venv/bin/python diagnose_data.py   # expect PROFILE: ok, HISTORY: ok candles=N, QUOTES: ok
.venv/bin/python test_ws.py         # expect live TICK lines
```
If REST returns `ok`, the plan holds. If it still fails from the cloud, stop — that would imply a FYERS
Data-API subscription requirement rather than Zscaler.

---

## Phase 1 — Provision the VM

1. Create an Oracle Cloud account (needs a card for verification; Always-Free is not charged).
2. **Compute → Instances → Create.** Region **Mumbai**. Shape: **Ampere A1 (arm64)** Always-Free
   (1–2 OCPU / 6–12 GB) or **VM.Standard.E2.1.Micro** (amd64, 1 GB). Image: Ubuntu 22.04/24.04.
   Download the SSH private key.
3. SSH in: `ssh -i <key> ubuntu@<public-ip>`.

## Phase 2 — Open the ports (TWO layers — common gotcha)

- **VCN Security List / NSG** (in the Oracle console): add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
- **Host firewall** (on the VM):
  ```bash
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save        # Ubuntu; persists across reboot
  ```

## Phase 3 — Deploy the app (venv + systemd)

```bash
sudo apt update && sudo apt install -y python3 python3-venv python3-pip git tzdata nodejs npm
sudo mkdir -p /opt/tradedash /data && sudo chown $USER /opt/tradedash /data

# get the code onto the VM (pick one): git clone <your repo>  |  scp from laptop  |  upload+unzip
git clone <your-repo-url> /opt/tradedash

# frontend build
cd /opt/tradedash/frontend && npm ci && npm run build

# backend venv + deps (pip-system-certs auto-skipped on Linux via the requirements marker)
cd /opt/tradedash/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install --no-deps fyers-apiv3==3.1.14
.venv/bin/pip install "aiohttp>=3.10" websocket-client aws-lambda-powertools "setuptools<81"
```

Create **`/opt/tradedash/.env`** (chmod 600):
```
FYERS_CLIENT_ID=XXXXXX-100
FYERS_SECRET_KEY=...
FYERS_FY_ID=...
FYERS_USER_PIN=...
FYERS_TOTP_SECRET=...
FYERS_REDIRECT_URI=https://parthitrade.duckdns.org/callback
CORS_ORIGINS=https://parthitrade.duckdns.org
HOST=127.0.0.1
PORT=8000
DATA_ENGINE_ENABLED=true
INSTANCE_NAME=oracle-mumbai
TOKEN_CACHE_FILE=/data/.token_cache.json
FRONTEND_DIST=/opt/tradedash/frontend/dist
SESSION_SECRET=<long-random-string>
# Dashboard login is Supabase Auth (see frontend/.env below) — verification uses
# Supabase's public JWKS endpoint, so only the project URL is needed here, no secret.
SUPABASE_URL=https://<your-project-ref>.supabase.co
```
> `chmod 600 /opt/tradedash/.env` — never commit it.

Also create **`frontend/.env`** (gitignored, read at build time by Vite):
```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-key>
```
Create the actual user you'll log in as under Supabase → **Authentication → Users → Add user**
(and disable "Allow new users to sign up" — this app only ever calls `signInWithPassword`).

## Phase 4 — DNS + HTTPS (DuckDNS + Caddy)

1. Register a subdomain at duckdns.org (e.g. `parthitrade`), set its IP to the VM's public IP, and add
   the DuckDNS updater cron (from their "install" page).
2. Install Caddy (https://caddyserver.com/docs/install), put `deploy/Caddyfile` at `/etc/caddy/Caddyfile`
   (edit the domain), `sudo systemctl reload caddy`. Caddy auto-provisions the TLS cert.

## Phase 5 — FYERS dashboard + start

1. In the FYERS app dashboard, set **Redirect URI** to `https://<domain>/callback` (exact match).
2. Install the service:
   ```bash
   sudo cp /opt/tradedash/deploy/tradedash.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable --now tradedash
   journalctl -u tradedash -f
   ```
3. Open `https://<domain>` → log in (Admin / your password) → click **Connect FYERS** → authorize →
   `/callback` captures the token (one-time consent for the new redirect URI). Done.

---

## Docker alternative (optional)
```bash
docker build -t tradedash .
docker run -d --name tradedash --restart=always \
  --env-file /opt/tradedash/.env -e HOST=0.0.0.0 \
  -p 127.0.0.1:8000:8000 -v tokendata:/data tradedash
```
Run **one replica only** (single FYERS websocket per app). Front it with the same Caddy config.

## Operating notes
- **Never** run local `run.py` with `DATA_ENGINE_ENABLED=true` during market hours while the VM is live —
  the two would fight over the single FYERS websocket. Local dev: set `DATA_ENGINE_ENABLED=false`.
- Token auto-renews daily (refresh-token flow at 08:45 IST; falls back to TOTP; then to a manual
  "Connect FYERS" click if both fail). The dashboard shows a banner when FYERS is disconnected.
- **Deploys are automatic**: pushing to `main` triggers `.github/workflows/deploy.yml`, which SSHes
  into the VM and runs `deploy/deploy.sh` (git reset --hard to origin/main, reinstall deps, rebuild
  frontend, restart the `tradedashboard-backend` service). Manual redeploy: `bash ~/app/deploy.sh`
  on the VM, or re-run the workflow from the Actions tab (`workflow_dispatch`).
