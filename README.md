# Live Indian Stock Breakout & Intraday Relative Strength Dashboard

Real-time scanning dashboard for the Indian market built on the **FYERS API v3**.
A Python **Backend-For-Frontend (BFF)** ingests millisecond websocket ticks,
computes the technical engines in memory, and streams diffed state to the browser
over a **WebSocket delta stream**. The React frontend renders 40+ rows with canvas
range bars at a stable frame rate.

```
FYERS WebSocket ──(ms binary ticks)──▶  Python BFF (FastAPI)
                                          • 08:45 IST automated TOTP login
                                          • REST backfill: prev close, ranges, C1–C4 ORB
                                          • in-memory math: IRS, ORB, range map, day-range %
                                          │
                                          └──(250 ms JSON deltas via WebSocket)──▶  React UI
```

**Security boundary:** all API keys, secret keys, TOTP seeds and the broker
websocket live **only** on the backend. The browser talks to the BFF, never to
the broker.

---

## Project layout

```
backend/
  app/
    config.py          # env vars, watchlist (40+ symbols), session timings
    state.py           # thread-safe in-memory market state
    auth.py            # automated FYERS v3 TOTP login + token cache
    calculations.py    # IRS, ORB, dual-range mapper, day-range % (pure fns)
    fyers_service.py   # REST backfill + websocket ingestion (lifecycle-managed)
    scheduler.py       # 08:45 login cron + market-hours gating
    main.py            # FastAPI app: /ws/stream (WebSocket), /api/snapshot, /api/health
  tests/test_calculations.py
  requirements.txt
  install.ps1
  run.py
  .env.example
frontend/
  src/
    App.jsx
    hooks/useMarketStream.js
    components/OverlappingRangeBar.jsx, WatchlistRow.jsx
  package.json, vite.config.js, tailwind.config.js
```

---

## Backend setup

Requires Python 3.11+ (tested on 3.13).

```powershell
cd backend
./install.ps1                    # handles the fyers-apiv3 / aiohttp / setuptools quirks
Copy-Item .env.example .env      # then edit .env with your real credentials
python run.py                    # serves http://127.0.0.1:8000
```

> **Why `install.ps1` and not just `pip install -r requirements.txt`?**
> `fyers-apiv3` hard-pins `aiohttp==3.9.3` (no Python 3.13 wheel) and a bogus
> `asyncio` backport. The script installs fyers with `--no-deps` plus
> 3.13-compatible transitive libs, and `setuptools<81` (fyers still imports the
> removed `pkg_resources`).

### Credentials (`.env`)

| Variable | Meaning |
|---|---|
| `FYERS_CLIENT_ID` | App id from the Fyers API dashboard, e.g. `ABCD1234-100` |
| `FYERS_SECRET_KEY` | App secret |
| `FYERS_FY_ID` | Your Fyers login/client id |
| `FYERS_USER_PIN` | 4-digit trading PIN |
| `FYERS_TOTP_SECRET` | Base32 TOTP seed from authenticator setup |
| `FYERS_REDIRECT_URI` | Must match the app's registered redirect URL |
| `FORCE_MARKET_OPEN` | `true` to run the engine outside market hours (dev) |

The automated login uses **your own account credentials** to mint the daily
access token programmatically (the standard headless algo-trading pattern). No
credential ever leaves the backend.

---

## Frontend setup

```powershell
cd frontend
npm install
npm run dev                      # http://localhost:5173
```

Vite proxies `/api/*` to the backend on port 8000, so start the backend first.
For production: `npm run build` → serve `dist/` behind the same origin as the API.

---

## Math engines (`app/calculations.py`)

| Engine | Formula |
|---|---|
| **IRS vs NIFTY 50** | `%Δstock − %Δindex` (both vs prev close); >0 outperform (green), <0 underperform (red) |
| **30-min ORB (C1–C4)** | boundaries = max/min over each completed candle; breakout when `LTP` crosses; newest completed candle wins |
| **Dual-range mapper** | global min/max across yesterday+today → map each price to `0–100%` |
| **Day range position** | `(LTP − todayLow) / (todayHigh − todayLow) × 100` → feeds the slider filter |

Run the engine tests (no credentials needed):

```powershell
cd backend
python -m tests.test_calculations
```

---

## Operational lifecycle (acceptance matrix)

1. **08:45 IST cron** — `scheduler` refreshes the access token via TOTP; token
   cached to `.token_cache.json` (survives mid-day restarts).
2. **Mid-day open** — on startup the backend REST-backfills prev close, yesterday
   high/low, and C1–C4 ORB boundaries, so no field is blank.
3. **Frame rate under load** — canvas range bars + `React.memo` rows keep repaints
   isolated to changed rows across 40+ symbols.
4. **Off-market standby** — outside 09:15–15:30 IST on weekdays the websocket is
   not run; the UI shows **Closed** and renders the last snapshot from
   `localStorage`.

---

## API endpoints

| Endpoint | Purpose |
|---|---|
| `WS /ws/stream` | WebSocket, delta frames every 250 ms (`snapshot` on connect, `delta` on change, `heartbeat` on quiet) |
| `GET /api/snapshot` | One-shot snapshot frame (same shape as the WS `snapshot` message; used to warm the store before WS connects) |
| `GET /api/health` | Liveness + market-open flag |

---

## Dashboard login & hosting

The dashboard is gated by a built-in login (session cookie). Set `ADMIN_USER` / `ADMIN_PASS` /
`SESSION_SECRET` in `.env` to enable it — leaving `ADMIN_PASS` empty disables the gate (local dev).
FYERS account auth is separate: click **Connect FYERS** in the UI (or hit `/callback`), which captures
the OAuth code and caches access + refresh tokens.

To run it off the corporate network (so FYERS REST endpoints aren't blocked by Zscaler), deploy to a
free Oracle Cloud VM — see **[deploy/README.md](deploy/README.md)** for the full step-by-step
(VM, DuckDNS + Caddy HTTPS, systemd, one-time FYERS consent). Key hosting env vars: `HOST=0.0.0.0`,
`FYERS_REDIRECT_URI=https://<domain>/callback`, `CORS_ORIGINS=https://<domain>`,
`DATA_ENGINE_ENABLED=true` (only ONE instance may open the FYERS websocket), `TOKEN_CACHE_FILE`.

## Troubleshooting

**`SSLError: certificate verify failed: unable to get local issuer certificate`**
Your network (e.g. a corporate proxy) does TLS inspection with a custom root CA
that Python's bundled `certifi` doesn't trust. Fixed by `pip-system-certs`
(already in `requirements.txt`), which makes Python's TLS use the Windows
certificate store — covering `requests`, the fyers SDK, and the websocket.
If it still fails, confirm your corporate root CA is installed in the Windows
store, or set `REQUESTS_CA_BUNDLE` / `SSL_CERT_FILE` to a bundle that includes it.

## Notes & extension points

- **Watchlist** — edit `WATCHLIST` in `app/config.py` (Fyers format `NSE:TCS-EQ`).
- **Live ORB aggregation** — REST backfill seeds C1–C4; to build boundaries live
  before REST is available, aggregate ticks per candle window in `_handle_tick`.
- **Multi-client scale** — a single `Broadcaster` task runs one diff per tick and fans the serialized frame to every subscriber via bounded `asyncio.Queue`s. Slow clients are silently resynced (drain + snapshot) rather than dropped. A `heartbeat` frame is emitted every ~5 s of quiet so the client liveness timer never fires during off-market hours.
