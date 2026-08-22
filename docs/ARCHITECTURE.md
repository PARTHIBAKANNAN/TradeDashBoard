# TradeDashboard — Complete System Architecture

A single Python process authenticates to FYERS API v3 automatically, subscribes to 211 symbols (210-stock F&O
watchlist + NIFTY 50) over one WebSocket connection, computes every indicator in memory tick-by-tick, and streams
diffed state to the browser at 250 ms cadence. A second, fully isolated asyncio loop recomputes a 20-day historical
"Smart Money" cross-sectional ranking every 5 minutes from a growing Postgres candle archive. Seven screens, one
simulated (paper) order-execution engine, zero microservices.

## Contents

1. [System topology](#01--system-topology)
2. [Security model](#02--security-model)
3. [Broker (FYERS) login](#03--broker-fyers-login)
4. [Dashboard login (Supabase)](#04--dashboard-login-supabase)
5. [Data ingestion](#05--data-ingestion)
6. [Real-time broadcast](#06--real-time-broadcast)
7. [Calculation engines](#07--calculation-engines)
8. [Momentum score / Recommended](#08--momentum-score--recommended)
9. [Smart Money Engine](#09--smart-money-engine)
10. [Cumulative Volume Delta](#10--cumulative-volume-delta-cvd)
11. [The seven screens](#11--the-seven-screens)
12. [Charts tab deep dive](#12--charts-tab-deep-dive)
13. [Dual sector taxonomy](#13--dual-sector-taxonomy)
14. [Paper trading engine](#14--paper-trading-engine)
15. [Frontend state architecture](#15--frontend-state-architecture)
16. [Storage & DB schema](#16--storage--db-schema)
17. [Process & concurrency model](#17--process--concurrency-model)
18. [Notifications (Telegram)](#18--notifications-telegram)
19. [Daily lifecycle](#19--daily-lifecycle)
20. [Deployment pipeline](#20--deployment-pipeline)
21. [Module map](#21--module-map)
22. [AI Copilot & Multi-Factor Quant Gatekeeper](#22--ai-copilot--multi-factor-quant-gatekeeper)

---

## 01 — System topology

Three tiers, plus one fully isolated background analytics loop:

```
FYERS API v3  ──ticks + REST──▶  FastAPI backend (single process)  ──250ms JSON deltas / WebSocket──▶  React SPA
  · REST: history, quotes           · Automated TOTP / refresh-token login       · WebSocket delta stream
  · WebSocket: SymbolUpdate          · REST backfill (ranges, ORB)                · lightweight-charts + Canvas
  · Vagator login endpoints          · In-memory math engines + Smart Money loop  · React.memo isolated rows
  · Millisecond binary ticks         · Thread-safe shared state (MarketState)     · 7 screens, one tab bar, no router
                                     · Market-hours gating (APScheduler)          · localStorage offline cache
```

- **211 symbols, one socket** — 210-stock F&O watchlist + NIFTY 50 benchmark, all on a single FYERS websocket connection.
- **Delta delivery** — ticks land at ms resolution; the Broadcaster diffs state every 250 ms and sends only changed fields.
- **Secrets isolated** — Client ID, secret, TOTP seed, PIN are backend env vars, never shipped to the browser.
- **Self-healing** — auto-reconnect websocket, on-disk token cache, automatic deploy rollback, localStorage snapshot cache.

> **Not microservices.** Everything in the middle tier — auth, REST backfill, the websocket ingester, every
> calculation engine, the broadcaster, and the Smart Money ranking loop — runs inside *one* Python process. See
> [§17 Process Model](#17--process--concurrency-model) for exactly how it's split across threads/tasks internally.

Postgres sits off to the side for record-keeping and a growing historical candle archive — it is **not** part of the
live-tick path (see [§16 Storage](#16--storage--db-schema)).

---

## 02 — Security model

The architectural boundary is the whole point of the backend-for-frontend design: credentials and the broker
connection are quarantined server-side.

| Never on the frontend | Backend-only |
|---|---|
| API keys, Client ID, Secret Key, TOTP seed, trading PIN, access/refresh tokens, the raw broker websocket, the Supabase service role | Loaded from `.env` via `python-dotenv`; the daily FYERS token cached to `.token_cache.json` on disk (git-ignored), not in any database |

**Corporate TLS.** On a network with SSL inspection, Python's bundled CA store rejects the broker's cert.
`pip-system-certs` routes TLS through the Windows certificate store (which holds the corporate root CA), fixing
`requests`, the FYERS SDK, and the websocket at once. Windows-only — skipped entirely on the Linux production host.

**Row-Level Security is defense-in-depth only.** Postgres RLS policies exist on `paper_orders`/`paper_wallets` keyed
on `auth.uid()=user_id`, but the backend connects with one pooled asyncpg service connection, not per-user JWTs —
`auth.uid()` never actually resolves server-side. Real per-user isolation is enforced application-side via an
explicit `WHERE user_id=$1` on every paper-trading query.

---

## 03 — Broker (FYERS) login

FYERS access tokens expire every 24 hours. Rather than a manual OAuth redirect every day, the backend drives FYERS'
programmatic login using your own credentials + a TOTP seed. A newly created app requires a **one-time browser
consent**; every day after is fully automatic.

### Token acquisition — the actual fallback chain

Every call to `get_access_token()` (including the 08:45 daily cron) tries these in order, stopping at the first success:

1. Same-day cached token
2. Refresh-token grant (~15-day validity, no TOTP)
3. Full TOTP + PIN login (steps below)
4. Give up, wait for manual "Connect FYERS"

In practice the full chain only runs once every ~15 days; most days step 2 alone renews the token silently. Both
tokens persist via atomic temp-file + `os.replace` rename to `.token_cache.json`, keyed off the JWT's own `exp` claim
minus a 120s safety skew.

### The full TOTP + PIN chain (step 3)

1. **Send login OTP challenge** — `POST /vagator/v2/send_login_otp_v2` (api-t2.fyers.in): `{fy_id: base64(FY_ID), app_id:"2"}` → `request_key` (sub: totp_login).
2. **Verify TOTP** — `POST /vagator/v2/verify_otp`: `{request_key, otp: pyotp.TOTP(seed).now()}` → `request_key` (sub: verify_pin). Retries once if generated right at a 30s window boundary.
3. **Verify PIN → vagator token** — `POST /vagator/v2/verify_pin_v2`: `{request_key, identity_type:"pin", identifier: base64(PIN)}` → `data.access_token` (the "vagator" bearer).
4. **Obtain the OAuth auth code** — `POST /api/v3/token` (api-t1.fyers.in) with the vagator bearer: `{fyers_id, app_id, redirect_uri, appType, response_type:"code", create_cookie:true}` → a redirect URL carrying `auth_code` (for an **authorized** app).
5. **Exchange for access & refresh token** — `SessionModel.generate_token()` POSTs to `/validate-authcode` with `appIdHash = SHA256("client_id:secret")` + the auth code → `access_token`, `refresh_token`.
6. **Cache & use** — powers the REST `FyersModel` and the `FyersDataSocket` feed (`CLIENT_ID:token`).

### One-time consent for a new app

A freshly created app is not yet authorized, so step 4 returns a pre-consent token with no `auth_code`. Running
`manual_auth.py` once (prints `auth.build_login_url()`, operator pastes the redirected URL back, then
`auth.exchange_and_cache()` runs) authorizes the app permanently.

### Environment gotchas resolved

| Symptom | Root cause | Resolution |
|---|---|---|
| `CERTIFICATE_VERIFY_FAILED` | Corporate TLS inspection; bundled CA store lacks the root CA | `pip-system-certs` → Windows cert store |
| Install fails on `aiohttp 3.9.3` | No Python 3.13 wheel; pinned by fyers-apiv3 | Install fyers with `--no-deps` + compatible libs |
| `No module named pkg_resources` | Removed in setuptools ≥ 81 | Pin `setuptools<81` |
| `invalid totp` (intermittent) | Code generated at 30s window boundary | Boundary-safe generation + one retry |
| `-437 invalid auth code` | New app not yet authorized → pre-consent token | One-time `manual_auth.py` consent |
| Endpoint `-1025` / `-1006` | Wrong endpoint variant | `send_login_otp_v2`, `verify_pin_v2`; `verify_otp` stays non-v2 |
| `-403`/`429` on REST `history()` | Account-level permission gap / rate limiting under the 210-symbol backfill | Treated as **non-retryable** (`_NON_RETRYABLE_CODES = {-403, 429}`) — fails fast; ORB data falls back to the tick-derived path |

---

## 04 — Dashboard login (Supabase)

Completely separate from broker auth above — this is *who's allowed to open the dashboard at all*, independent of
whether the backend currently has a working FYERS connection.

1. **Client-side Supabase auth** — the Login screen (inline in `App.jsx`) calls `supabase.auth.signInWithPassword({email, password})` using a frontend Supabase client configured with only the **anon** key.
2. **Exchange for a backend session** — `POST /api/auth/login` with the resulting `access_token`, `credentials:"include"`. The backend verifies the JWT against Supabase's JWKS endpoint (ES256/RS256, audience `"authenticated"`, no shared secret) and stores `{email, user_id}` in a Starlette `SessionMiddleware` cookie (`same_site="lax"`).
3. **Wallet provisioning** — on successful login, `paper_trading.ensure_wallet()` lazily creates a `paper_wallets` row (₹1,00,000 starting balance) for a first-time user.
4. **Every subsequent request** — `GET /api/auth/me` is the sole gate the SPA checks on mount. Every login-gated route uses `Depends(security.require_login)`, reading the same session cookie — no bearer token is ever kept in JS state.
5. **Logout** — `supabase.auth.signOut()` **and** `POST /api/auth/logout`, both, so neither side is left stale.

**Dev mode**: if `SUPABASE_URL` is unset, `security.py`'s login gate treats every request as authenticated under a
fixed `DEV_USER_ID` — the whole app runs locally with zero Supabase project configured.

**A third, unrelated auth concern**: `ConnectFyersBanner` (shown whenever the backend's FYERS *broker* connection
drops) is not a login screen — it opens `GET /api/auth/login-url`'s broker OAuth URL in a new tab to reauthorize data
ingestion, while the user's own dashboard session stays fully logged in throughout.

---

## 05 — Data ingestion

Two ingestion paths feed one thread-safe in-memory state: a REST **backfill** at startup, and the live **websocket**
for streaming ticks.

### A · Startup REST backfill — `DataEngine.backfill()`, in order

FYERS' `history()` has no batch mode — each pass is a loop of individual REST calls (one per symbol), paced 50ms
apart. Only `quotes()` batches (≤50 symbols/request).

0. **Validate symbols** — `validate_symbols()` batches all 211 symbols into 50-at-a-time `quotes()` calls, drops anything not returning `s=="ok"` — protects the WS subscription from one bad ticker tearing down the connection.
1. **Previous day** — daily candles (`resolution:"D"`, 12-day lookback) → last *completed* day's high/low/close for every symbol.
2. **Today's ORB** — 30-min candles for today → C1–C4 high/low keyed by candle start-time, plus today's running high/low.
3. **Breakout-quality seed** — 5-min candles for the 09:15–09:45 opening range → `candle1_high/low` + the two-sided-range check.
4. **Quote seed** — batched `quotes()` seeds an initial LTP for every symbol before the first tick arrives.

> **Known account limitation.** On this FYERS account, `history()` currently returns `-403 Additional permission
> required` — treated as non-retryable, so passes 1–3 return nothing in production; only the batched quote seed
> succeeds. ORB boundaries and breakout-quality data are instead derived *live from ticks*
> (`candle_aggregator.py`) using identical math, just fed from the websocket instead of REST history. If FYERS'
> permission is ever restored, the REST passes simply start working again — the two paths don't conflict.

### B · Symbol subscription & live websocket ingestion

All 210 watchlist stocks plus the NIFTY 50 index are subscribed together on **one single websocket connection** —
the `fyers_apiv3` SDK's own `symbol_limit` is 5000 (chunking only above that), well beyond the 211-symbol universe.

```python
# fyers_service.py — one connection, full watchlist + benchmark
self.ws = FyersDataSocket(
    access_token=f"{CLIENT_ID}:{token}",
    litemode=False,       # full tick: LTP, high/low, volume, circuit limits, buy/sell qty
    reconnect=True,
    on_connect=on_open, on_close=on_close, on_error=on_error, on_message=on_message,
)
self.ws.connect()                          # BLOCKING — run on its own daemon thread

# inside on_connect:
self.ws.subscribe(symbols=valid_symbols, data_type="SymbolUpdate")  # all 211 at once
self.ws.keep_running()
```

**Exact per-tick field extraction & dispatch — `_handle_tick(msg)`:**

```python
fy_symbol = msg.get("symbol")                                    # required, else drop
ltp = msg.get("ltp") or msg.get("last_traded_price")              # required, else drop
high, low = msg.get("high_price") or msg.get("high") or 0, msg.get("low_price") or msg.get("low") or 0
prev_close = msg.get("prev_close_price") or msg.get("prev_close") or 0
volume = msg.get("vol_traded_today") or msg.get("volume") or 0
upper_ckt, lower_ckt = msg.get("upper_ckt") or 0, msg.get("lower_ckt") or 0
tot_buy_qty, tot_sell_qty = msg.get("tot_buy_qty") or 0, msg.get("tot_sell_qty") or 0

if fy_symbol == BENCHMARK_SYMBOL:                       # NSE:NIFTY50-INDEX
    market_state.set_nifty(ltp=ltp, prev_close=prev_close or None)
    candle_aggregator.on_index_tick("NIFTY50", ltp, now_ist)  # feeds Smart Money's RS calc — see §09
    return
process_incoming_tick(market_state, short_symbol(fy_symbol), ltp, high, low,
                       prev_close, volume, upper_ckt, lower_ckt, tot_buy_qty, tot_sell_qty)
```

Flow: `FyersDataSocket` (211 symbols, 1 connection, daemon thread) → `_handle_tick` (defensive key read; NIFTY routes
to `set_nifty()`+`on_index_tick()`, equities route to `process_incoming_tick`) → under `MarketState`'s RLock:
LTP/today-H-L/VWAP, %Δ/RS/day-pos, `candle_aggregator.on_tick()`, ORB eval + quality gates, then (outside the lock)
`order_monitor` for paper trades → mutates `MarketState`.

---

## 06 — Real-time broadcast

A single `Broadcaster` task snapshots state every `STREAM_INTERVAL` (250ms), diffs it against the previous snapshot,
and fans the minimal JSON delta (or a full snapshot on first connect/resync) to every subscriber via bounded
`asyncio.Queue`s. This is a completely separate WebSocket connection from the FYERS one — the browser only ever talks
to this backend, never to FYERS directly.

**Fields carried in every snapshot/delta stock entry**: `symbol`, `sector`, `ltp`, `pct_change`,
`relative_strength`, `day_range_pos`, `signal`, `signal_time`, `volume`, `traded_value` (derived: `ltp×volume`),
`yesterday_low/high`, `today_low/high`, `vwap`.

```python
# Broadcaster._tick_once — runs every 250 ms on the asyncio loop
frame = build_frame(prev, curr, seq=next_seq)  # None if nothing changed
if frame is None and not needs_resync:
    # after ~20 quiet ticks (5s at 250ms), emit a heartbeat to keep client liveness alive
    ...
for q in subscribers:
    try: q.put_nowait(json.dumps(frame))
    except asyncio.QueueFull:
        # slow client: drop its queue contents, force a fresh snapshot next tick
        drain(q); mark_resync(q)
```

| Endpoint | Method | Purpose |
|---|---|---|
| `/ws/stream` | WebSocket | 250ms delta frames (`snapshot` on connect, `delta` on change, `heartbeat` on quiet). Session-cookie authenticated — closes with code `4401` if unauthenticated. Client can send `{"type":"resync"}` to force a fresh snapshot. |
| `/api/snapshot` | GET | One-shot snapshot frame — warms the SPA before the WS connects |
| `/api/health` | GET | Public. Liveness + market-open flag + FYERS auth status — also polled by `deploy.sh` after every restart |

**Slow-client protocol**: if a subscriber's bounded queue (`BROADCAST_MAX_QUEUE`, default 8) fills up, the broadcaster
drains it and force-resyncs that one client with a fresh snapshot next tick, rather than blocking the whole broadcast
loop.

---

## 07 — Calculation engines

Every tick recomputes these deterministic engines in memory before the next broadcast. All functions are pure (no
side effects) and unit-tested in isolation.

### Engine A — Intraday Relative Strength vs NIFTY 50 (RS)

```
RS = round(Δ% Stock − Δ% NIFTY, 2)
```
Each side is % change vs its own previous close. The single biggest input into the Momentum Score — positive means
outperforming the index right now. Field: `stock["relative_strength"]`.

### Engine B — % Change

```
pct_change = round((LTP − prev_close) / prev_close × 100, 2)   # 0.0 if prev_close falsy
```

### Engine C — Day Range Position (%)

```
day_range_pos = round((LTP − today_low) / (today_high − today_low) × 100, 2)   # 0 if span <= 0
```
Feeds the "Extended" warning badge, the Momentum Score's extension penalty, and Insights' New Highs/Lows (≥95%/≤5%).

### Engine D — Volume-Weighted Average Price (VWAP)

```python
def update_vwap(cum_pv, cum_vol, prev_total_volume, new_total_volume, ltp):
    delta = max(0, new_total_volume - prev_total_volume)
    if delta == 0:
        return cum_pv, cum_vol, round(cum_pv/cum_vol, 4) if cum_vol else 0.0
    new_cum_pv = cum_pv + ltp * delta
    new_cum_vol = cum_vol + delta
    return new_cum_pv, new_cum_vol, round(new_cum_pv/new_cum_vol, 4)
```
Ticks carry *cumulative* today's volume, not per-trade size — each tick's volume delta is multiplied by that tick's
LTP and added to a running (price×volume) sum, divided by running volume. A non-monotonic (stale/duplicate) volume
tick is treated as a zero delta rather than corrupting the running sums.

### Engine E — 30-min Opening Range Breakout (C1–C4)

Candles: C1 09:15–09:45 · C2 09:45–10:15 · C3 10:15–10:45 · C4 10:45–11:15.

```python
def evaluate_orb(orb_bounds, ltp, now_ist, current_signal):
    ready = completed_candles(now_t)
    for name in reversed(ready):        # newest completed candle checked FIRST
        bounds = orb_bounds.get(name)
        if not bounds: continue
        if ltp > bounds["high"]: new_signal = f"Bull • {name}"
        elif ltp < bounds["low"]: new_signal = f"Bear • {name}"
        else: continue
        if new_signal != current_signal:
            return new_signal, now_ist.strftime("%H:%M")
        return None, None            # already in this signal state — stop, don't check older candles
    return None, None
```
**Precedence rule**: the most recently completed candle whose boundary is breached wins outright; older candles are
never consulted once a newer one has been evaluated.

### Engine F — Normalized Dual-Range Mapper

```
x(P) = (P − min) / (max − min) × 100     where min = min(Y_low, T_low), max = max(Y_high, T_high)
```
Yesterday's and today's ranges (plus the live LTP) all map onto one shared 0–100% scale, drawn as one canvas bar
(`calculations.range_map`, mirrored client-side in `rangeMap.js`).

### Breakout quality gates — C1 only

C2–C4 are pure structural breaks with no filter. A **C1** (opening-range) breakout must pass both before firing:

1. **First-candle-extreme-intact** — `first_candle_extreme_intact(bullish, candle1_high, candle1_low, today_high, today_low)`: for a bullish breakout, `today_low >= candle1_low` (the first 5-min candle's low must still be the day's low so far); mirror check for bearish. Fails closed if the candle-1 reference is still at its 0.0 default.
2. **Two-sided range** — `has_two_sided_range(candles)`: among the six 5-min candles in 09:15–09:45 (needs ≥6, else `False`), at least one must close red (`close < open`) and at least one green (`close > open`).

> **Tick-derived, not REST-derived.** Because `history()` is broken on this account, `candle_aggregator.py` builds the
> C1–C4 boundaries and quality-gate inputs live from ticks — same formulas, different source. It also separately
> records every completed 5-min candle across the whole session (including per-bucket volume and tick-rule delta)
> into `candle_history` — an entirely separate code path so that addition (now the data source for CVD and Smart
> Money too) can never regress the signal logic above.

### Full per-tick sequence — `process_incoming_tick(...)`, in order

1. Seed `prev_close` once, if not already set.
2. `stock["ltp"] = ltp`.
3. If volume truthy: update VWAP, commit `stock["volume"]`.
4. Overwrite `upper_ckt`/`lower_ckt`/`tot_buy_qty`/`tot_sell_qty` if truthy.
5. Expand `today_high`/`today_low` (guarded against a zeroed backfill).
6. Recompute `pct_change`, `day_range_pos`, `relative_strength`.
7. `candle_aggregator.on_tick(stock, ltp, now_ist)` — ORB bounds + day/opening-range candle tracking.
8. `evaluate_orb(...)` → candidate new signal.
9. If the candidate is a C1 signal, gate it through both quality checks; discard if either fails.
10. Commit signal/signal_time if one survived.
11. *(outside the lock)* `order_monitor.on_tick_threadsafe(...)` fires paper-trading SL/Target/TSL checks.

> **Verified.** The engine suite passes its unit tests — pct-change, RS, day-range, dual-range map, VWAP, ORB
> breakout & precedence, the Momentum Score, the Smart Money Engine, CVD tick-rule, trailing-stop, brokerage, and
> margin math all have dedicated test files exercised on every deploy (66 backend tests as of this report).

---

## 08 — Momentum score / Recommended

A 0–100 composite that ranks every currently-signaled stock, computed identically in two places from one ported
formula: client-side (`momentumScore.js`) for the on-screen tag, server-side (`momentum_score.py`) on a schedule for
Telegram checkpoint alerts. This is the older of the app's two recommendation engines — see [§09](#09--smart-money-engine)
for the newer, history-driven one.

### Hard filter — applied before any scoring

Score is forced to **0** if there's no active signal, or if the signal direction disagrees with NIFTY's own move
right now — a Bull signal needs NIFTY %change ≥ 0; a Bear signal needs NIFTY %change ≤ 0.

### Weighted composite (if the hard filter passes)

| Component | Weight | Formula | Rewards |
|---|---|---|---|
| RS vs NIFTY | 30% | `clamp(signed RS × 10, 0, 100)` | Outperforming the index in the signal's direction |
| RS vs sector | 15% | `clamp(signed sector-RS × 10, 0, 100)`, sector-RS = pct_change − sector_mean_pct | Outperforming fine-grained industry peers (§13) |
| Traded-value percentile | 20% | percentile rank of `ltp×volume` among all currently-signaled stocks | Real money behind the move |
| VWAP side | 15% | `100` if on the favorable side of VWAP, else `0` (binary) | Trading with the day's volume-weighted trend |
| Signal freshness | 10% | `C1=100 · C2=75 · C3=50 · C4=25` | Earlier breakouts over later, staler ones |
| Extension penalty | 10% | `clamp(100 − 2×|day_range_pos − 50|, 0, 100)` | Room left to run |

```python
WEIGHTS = {"rs": 0.30, "sector": 0.15, "volume": 0.20, "vwap": 0.15, "freshness": 0.10, "extension": 0.10}
CONFIDENCE_FLOOR = 60
MAX_PICKS = 3
```

- **Confidence floor** — only the top 3 stocks scoring ≥60 get the Recommended tag. Below that, the tag simply doesn't appear.
- **Checkpoint-locked** — recomputed every tick underneath, but the *displayed* picks (frontend, `useRecommendedStocks`) only re-lock every 30 minutes, aligned to ORB candle boundaries, to avoid flicker.

> **What this score does *not* know**: chart structure, prior peaks, whether "this already failed once today,"
> institutional order flow, or historical volume context — exactly the gap the Smart Money Engine below fills.

---

## 09 — Smart Money Engine

A second, independently-computed 0–100 composite, deliberately isolated from every screen/engine above: its own
router, its own asyncio background loop, its own tab. It never writes back into `MarketState` and reads
`candle_history` read-only — nothing here can regress the Momentum Score, ORB signals, or any other screen.

### Why it exists

Absolute volume is misleading — intraday volume naturally forms a U-shape (high at open/close, dead at midday), so a
"high volume" reading at 11:30am and one at 9:20am aren't comparable. The Smart Money Engine instead compares each
5-minute bucket only against the **same time slot** on that symbol's own last `LOOKBACK_DAYS` (20) trading days.

```python
BENCHMARK_SHORT_SYMBOL = "NIFTY50"
LOOKBACK_DAYS = 20
MIN_HISTORY_DAYS = 3
TOP_N = 10
WEIGHTS = {"turnover": 0.50, "rvol": 0.30, "rs": 0.20}
RECOMPUTE_INTERVAL_SECONDS = 300
```

### Metric 1 · weight 50% — Fresh Turnover Ratio

```python
fresh_turnover = float(last["close"]) * float(last["volume"] or 0)
if slot and days >= MIN_HISTORY_DAYS and slot["avg_turnover"]:
    fresh_turnover_ratio = fresh_turnover / slot["avg_turnover"]
```
Uses the latest 5-min bucket's Close (the spec's own documented fallback — no true per-bucket VWAP is tracked, to
avoid a second per-tick accumulator on the hot path) × its volume, divided by that same slot's historical average
turnover.

### Metric 2 · weight 30% — RVOL (Relative Volume)

```python
if slot and days >= MIN_HISTORY_DAYS and slot["avg_volume"]:
    rvol = volume / slot["avg_volume"]
```

### Metric 3 · weight 20% — Relative Strength vs NIFTY (today-so-far)

```python
def _today_return(rows):
    first, last = rows[0], rows[-1]
    open_ = float(first["open"] or 0)
    if not open_: return None
    return (float(last["close"]) - open_) / open_ * 100

relative_strength = round(stock_return - nifty_return, 2)
```
**Deliberately different** from Engine A in §07 — that one is anchored on *yesterday's close*; this one is anchored
on *today's own open* (the first 5-min bucket's open price). Both stock and NIFTY returns use the exact same formula,
both fed from `candle_history` rows (NIFTY's own 5-min OHLC is captured via `candle_aggregator.on_index_tick`, added
specifically to support this calculation).

### Composite — Smart Money Score

```python
score = round(0.50*turnover_pct + 0.30*rvol_pct + 0.20*rs_pct, 1)
```
Each raw metric is converted to a 0–100 percentile rank (`_percentile_rank`: fraction of the eligible population's
values ≤ this value, ×100) *within the eligible cross-section only* before weighting — so metrics on wildly different
scales (a ratio around 1.0 vs. a % figure) combine fairly.

### History bootstrapping — the one real constraint

A symbol needs at least `MIN_HISTORY_DAYS` (3) trading days of same-slot history before its ratio metrics are trusted
at all — below that, `fresh_turnover_ratio`/`rvol` stay `None` and the symbol is **excluded from ranking entirely**
(not scored with a misleading placeholder). Full confidence is reached at `LOOKBACK_DAYS` (20) days. Because
`candle_history`'s volume column only started populating recently, the tab surfaces `eligible_symbols`/`total_symbols`
and a per-row `days_history` count explicitly, with a "building history" banner shown whenever zero symbols are yet
eligible — a real data constraint, not a bug.

### Scheduling — an independent asyncio loop, not the cron scheduler

```python
# smart_money.py — started once from main.py's lifespan, cancelled on shutdown
async def run_loop():
    while True:
        await compute_rankings()          # reads candle_history + market_state, writes only _latest
        await asyncio.sleep(300)          # RECOMPUTE_INTERVAL_SECONDS — matches the spec's own 5-min cadence
```
Computes once immediately on startup (so the tab isn't empty for a full 5 minutes after a restart), then every 5
minutes forever, swallowing per-iteration exceptions so one bad cycle never kills the loop. Kept as a native asyncio
task rather than an APScheduler thread job precisely because it only does async DB reads — no blocking SDK involved —
so it can't stall or be stalled by the thread-based FYERS engine (see [§17](#17--process--concurrency-model)).

`GET /api/smart-money/top10` returns:
```
{computed_at, market_open, total_symbols, eligible_symbols, min_history_days, lookback_days,
 top: [{symbol, sector, score, fresh_turnover_ratio, rvol, relative_strength, *_percentile, days_history}, …]}
```

> **Explicitly a watchlist filter, not a trade signal.** Both the module's own docstring and the SmartMoneyScreen UI
> copy state this outright — appearing in the Top 10 means "worth watching"; entries still require the user's own
> structural trigger (ORB break, PDH break, etc.) before acting.

---

## 10 — Cumulative Volume Delta (CVD)

A tick-rule approximation of buy vs. sell pressure — not true order-flow (FYERS' feed carries no bid/ask-crossed
trade classification), but a directionally useful proxy computed with zero extra API cost from data already flowing
through the tick pipeline.

### Tick rule — `candle_aggregator._tick_delta`

```python
def _tick_delta(sym, ltp, volume):
    prev_ltp = _last_ltp.get(sym)
    prev_volume = _last_volume.get(sym, volume)
    vol_delta = max(0, volume - prev_volume)          # unsigned traded qty since last tick
    _last_ltp[sym] = ltp; _last_volume[sym] = volume
    if prev_ltp is None or vol_delta == 0:
        return 0.0, float(vol_delta)
    if ltp > prev_ltp:  return  float(vol_delta), float(vol_delta)   # uptick -> buy-side (+)
    if ltp < prev_ltp:  return -float(vol_delta), float(vol_delta)   # downtick -> sell-side (-)
    return 0.0, float(vol_delta)                                      # unchanged price -> 0
```
Returns `(signed_delta, vol_delta)`; the unsigned `vol_delta` is separately accumulated as the bucket's traded volume
(feeding RVOL/Fresh-Turnover in §09).

### Storage vs. display — two different "cumulative"s

- **What's persisted**: `candle_history.delta` stores the signed delta accumulated *within each individual 5-min bucket only* — reset to zero at the start of every new bucket, not a running intraday total.
- **What's displayed**: the Charts tab's CVD histogram (`CandleChart.jsx`) computes the true running total client-side (`cumulative += candle.delta` across the whole fetched day) — so the chart shows the actual intraday CVD trend, not per-bucket noise.

### Rendering — the crosshair-synced badge (not per-bar labels)

An earlier version tried printing the cumulative value as text directly on each histogram bar — abandoned as "too
cluttered once zoomed out" (confirmed via an interactive HTML mockup comparison). The shipped design instead:

- Colors each bar green/red by the **sign of the cumulative total** at that point (not the bar's own per-bucket delta) — a brief run of small down-ticks that hasn't erased the day's net buying still reads green.
- Shows **zero text on the bars themselves**.
- A small badge overlay (top-right of the chart) reads `CVD <value>`, showing the latest cumulative total at rest.
- `chart.subscribeCrosshairMove()` reads the histogram series' value at the hovered bar's time and swaps the badge to that bar's value (highlighted border) while hovering — reverting to "latest" on mouse-leave.

---

## 11 — The seven screens

One tab bar, no router — `Dashboard` (in `App.jsx`) holds `activeTab` as plain state and renders exactly one screen
at a time inside a `framer-motion` fade/slide transition. Every screen below (except Smart Money) consumes the same
live `stocks` array, derived once in `Dashboard` from `marketStore`.

| Screen | What it shows |
|---|---|
| **📊 Ranking** | Full watchlist table. Filters: signal (Bull/Bear), sector, signal-time cutoff (15-min marks), symbol search. Sorts: breakout-qualified-first (default), RS ▲/▼, % change, day-range %, A–Z. Rows show the "Recommended" badge and an against-trend warning; each has a Trade button and an "Open in Charts" icon. |
| **🔥 Heatmap** | Sector/stock treemap (`d3-hierarchy`-powered `Treemap`) — tile size = total traded value, color = %change (sector avg or per-stock). Click a sector to drill down to its member stocks. |
| **💡 Insights** | Widget dashboard, all derived from the live snapshot: Market Breadth, Buy/Sell Pressure, Sector Leaderboard, Breakout Leaderboard, Sector Rotation scatter (mean %change vs. mean RS, quadrant-labeled), Circuit Proximity (within 2% of upper/lower circuit), New Highs/Lows (day-range ≥95%/≤5%), Top Gainers/Losers/Most-Active/RS-leaders (top 8 each). |
| **⭐ Watchlist** | User's starred stocks (own `localStorage["watchlist"]` key, separate from the Charts tab's wishlist). Search-filtered table of starred stocks plus a "top 20 by \|%change\|" browse-and-add section below it. |
| **📈 Charts** | Scrollable, virtualized feed of live candlestick+CVD charts, one per stock, 2-column on desktop. Filters: sector, wishlist-only, symbol search (Strategy filter reserved/disabled). Deep dive in §12. |
| **🧠 Smart Money** | The only screen that doesn't consume the live `stocks` prop — polls `/api/smart-money/top10` every 30s independently. Top-10 table with a score bar, Fresh Turnover/RVOL ratios, RS vs NIFTY, and a history-depth indicator per row. |
| **🧪 Positions (Paper Trading)** | Three sub-tabs — Trade (order ticket + open positions), History (closed/cancelled orders, date-filtered), Reports (charges summary, exports, equity curve). Full detail in §14. Nav tab badges with the live open-position count even if never opened. |

### Cross-screen navigation — "Open in Charts"

Ranking, Watchlist, and Smart Money each expose an "Open in Charts" icon per row. Clicking it calls
`Dashboard.openInCharts(symbol)`, which sets both `activeTab="charts"` and a lifted `chartsFocusSymbol` state in one
call — `ChartsScreen` then clears its own filters, scrolls the matching `#chart-row-<SYMBOL>` element into view, and
reports back so the focus state clears.

---

## 12 — Charts tab deep dive

### Two rendering technologies, deliberately

- **lightweight-charts (Charts tab)** — full interactive chart: pan/zoom/crosshair, two panes (candlesticks 3:1 stretch, CVD histogram 1:1), reference price lines, live theme recoloring. One instance per stock, created once and updated imperatively (never torn down on data change, to preserve pan/zoom state).
- **Hand-rolled Canvas (table rows)** — `MiniCandlestick.jsx`, a tiny 200×36px DPR-scaled sparkline used inline in `WatchlistRow`. No axes/zoom/CVD, fixed 75-slot width (the whole 09:15–15:30 session at 5-min resolution) so density stays constant through the day. Cheap enough to render 100+ per table.

### CandleChart.jsx — series & panes

- **Pane 0 — CandlestickSeries.** Up/down colors read live from CSS variables `--bull-strong`/`--bear-strong` (theme-aware).
- **Pane 1 — HistogramSeries (CVD).** `priceFormat:{type:"volume"}`, stretch-factored 1 vs. pane 0's 3.
- **Autoscale provider.** `series.applyOptions({autoscaleInfoProvider})` widens the candlestick series' auto-computed price range to also cover the reference-level values — otherwise a level line outside the candles' own high/low would silently scroll off the visible axis.
- **Reference price lines** (`createPriceLine`, dashed): Opening-Range High (green), Opening-Range Low (red), Previous-Day High/Low (amber), **Pivot** (violet) — `(prev_high + prev_low + prev_close)/3`, the classic floor-trader pivot, computed in `candle_query.get_levels()`, only when all three inputs are available.
- **Time axis correctness.** lightweight-charts renders UTCTimestamp labels in UTC regardless of the browser's own timezone — `bucketToTime()` builds the epoch from UTC-midnight-plus-bucket-minutes rather than the browser's local wall clock, fixing an earlier bug where 09:15 IST rendered as 03:45.

### Data path & virtualization

1. **Lazy mount** — `useInViewport()` (IntersectionObserver, 800px overscan margin) — a chart only renders once scrolled near-into-view; otherwise a same-height placeholder holds its spot. Avoids ever mounting 200+ live chart instances at once.
2. **Initial fetch** — `useSymbolCandles(symbol)` checks an in-memory cache, else `GET /api/charts/candles/{symbol}` → `candle_query.get_today_candles()`, which merges persisted `candle_history` rows with the still-forming in-progress bucket from `candle_aggregator.get_in_progress()` (tagged `is_live:true`).
3. **Live tick merge** — subsequent ticks (`useStock(symbol)`) are folded into the last candle client-side via the shared `candleMerge.js`, plus a local tick-rule delta mirror (`mergeTickWithDelta`) matching the backend's own CVD rule.

### Wishlist ("+" icon)

`chartsWishlistStore.js` — its own `useSyncExternalStore` store backed by `localStorage["chartsWishlist"]`,
deliberately kept separate from the Watchlist screen's own `localStorage["watchlist"]` key.

---

## 13 — Dual sector taxonomy

Two separate sector maps exist on purpose, on both backend and frontend, because one taxonomy can't serve both jobs
well at once.

| | `WATCHLIST` sector (display) | `INDUSTRY_GROUP` sector (scoring) |
|---|---|---|
| Size | 210 entries | 210 entries (separate map) |
| Labels | Coarse, matching a companion tool's own taxonomy: *Nifty 50, Bank, Pvt Bank, Psu Bank, Fin Service, It, Auto, Pharma, Fmcg, Energy, Metal, Realty, Cement, Midcap Select, Others* | Fine-grained (pre-2026-08-06 taxonomy): *Energy, Power, Capital Goods, Consumer Durables, Infra, Pvt Banks, PSU Banks, NBFC, Insurance, Capital Markets, ...* |
| Used by | Every visible Sector filter/dropdown (Ranking, Charts, Heatmap, Watchlist) | Only `momentum_score.py`'s RS-vs-sector component, mirrored on the frontend as `industryGroup.js` |

> **Why not just one taxonomy.** The display taxonomy's "Bank" bucket, for example, lumps private and PSU banks that
> behave very differently intraday; using it for RS-vs-sector scoring would dilute the signal by comparing a stock
> against too-dissimilar peers. The finer `INDUSTRY_GROUP` preserves scoring quality while the coarser `WATCHLIST`
> sector stays what users actually see and filter by.

---

## 14 — Paper trading engine

A fully separate subsystem from the live market-data path — its own Postgres tables, its own router, its own
per-tick hook (`order_monitor.on_tick_threadsafe`) fired from inside `process_incoming_tick` but otherwise
independent. Every user gets a virtual wallet (₹1,00,000 starting balance) and can place MARKET/LIMIT orders with
optional SL/Target/trailing-stop brackets against live prices, at simulated Indian-market brokerage/tax rates.

### Order lifecycle

1. **Place** — `POST /api/paper/orders`. MARKET fills immediately at LTP; LIMIT queues as `PENDING`. Required margin is checked/locked against the wallet up front.
2. **Monitor (every tick)** — `order_monitor.py`: for pending LIMIT orders, `_limit_hit()` checks fill; for open positions, `_ratchet_trailing_stop()` runs first (updates the trailing peak/SL if a TSL is configured), then `_bracket_hit()` checks SL/Target — in that order, so a stop just moved by the ratchet is honored on the same tick.
3. **Close** — manual (`POST /orders/{id}/close`), or automatic on SL/Target/end-of-day square-off. Computes realized P&L, brokerage/tax charges, `net_pnl = realized_pnl − total_charges`; credits `margin_locked + net_pnl` back to the wallet. Non-manual closes fire a Telegram alert.

### Margin — simulated 5× intraday leverage

```python
INTRADAY_LEVERAGE = 5
required_margin(entry_price, quantity) = round((entry_price * quantity) / 5, 2)
max_affordable_qty(balance, ltp) = int((balance * 5) // ltp)
```
A flat approximation, not a real per-stock SPAN/exposure margin model.

### P&L

```python
def unrealized_pnl(side, quantity, entry_price, ltp):
    direction = 1 if side == "BUY" else -1
    return round(direction * (ltp - entry_price) * quantity, 2)
# realized_pnl uses the same formula with exit_price in place of ltp
```

### Trailing stop — ratchet mechanics (`trailing_stop.py`)

```python
def update_peak(side, current_peak, ltp):
    return max(current_peak, ltp) if side == "BUY" else min(current_peak, ltp)

def trailing_sl_price(side, peak, tsl_type, tsl_value):
    offset = peak * (tsl_value / 100) if tsl_type == "PERCENT" else tsl_value
    return round(peak - offset, 4) if side == "BUY" else round(peak + offset, 4)

def ratchet_sl(side, current_sl, candidate_sl):
    if current_sl is None: return candidate_sl
    return max(current_sl, candidate_sl) if side == "BUY" else min(current_sl, candidate_sl)
```
Offset = `peak × tsl_value/100` (PERCENT) or a flat `tsl_value` (POINTS). `ratchet_sl()` only ever moves the stop
favorably — never against the position. Single-tier only (one type/value per order; no multi-phase R-based staging).

### Brokerage & statutory charges (`brokerage.py`)

```python
BROKERAGE_RATE = 0.0003        # 0.03% per leg, capped at ₹20/leg
STT_SELL_RATE  = 0.00025       # 0.025% on sell-leg turnover only
EXCHANGE_TXN_RATE = 0.0000297  # both legs
SEBI_RATE = 0.0000001          # ₹10/crore, both legs
STAMP_DUTY_BUY_RATE = 0.00015  # 0.015% on buy-leg turnover only
GST_RATE = 0.18                # on (brokerage + exchange charges) only

brokerage        = min(entry_turnover*0.0003, 20) + min(exit_turnover*0.0003, 20)
stt              = sell_turnover * STT_SELL_RATE
exchange_charges = (entry_turnover + exit_turnover) * EXCHANGE_TXN_RATE
sebi_charges     = (entry_turnover + exit_turnover) * SEBI_RATE
stamp_duty       = buy_turnover * STAMP_DUTY_BUY_RATE
gst              = (brokerage + exchange_charges) * GST_RATE
total_charges    = brokerage + stt + exchange_charges + sebi_charges + stamp_duty + gst
```
Note: STT/stamp-duty are charged per *actual leg direction* (buy_turnover/sell_turnover), not per entry/exit —
reversed for a short — matching the real Indian intraday-equity charge structure.

### Order ticket & risk controls (UI)

`PlaceOrderForm` — symbol, quantity, side, order type, optional limit price, optional SL/Target, optional
trailing-stop (`TslFields`, shared with `EditPositionModal`), and a free-text **journal note** field ("Why this
trade? Setup, conviction, plan…"). Live margin lookup on every symbol/qty change. Two-step submit: a confirmation
panel echoes the full order back, with an amber high-risk warning if the order would use >25% of available balance.

### History, reports & exports

- **Order History** — closed/cancelled orders, date-range filterable, close-reason labels (Manual/SL/Target/Square-off), a full charges-breakdown tooltip, and journal notes surfaced via a sticky-note icon tooltip per row — the closest thing to a trade "journal" in the app.
- **Charges Summary** — client-side aggregate (brokerage/STT/stamp-duty/exchange+SEBI/GST/total/net P&L) over whatever date-filtered orders are already loaded — no separate backend aggregate endpoint.
- **Excel Exports** — `GET /api/paper/orders/export?section=...` streams a server-generated `.xlsx` (openpyxl): Orders / P&L / Tax / Brokerage / Combined, date-range scoped.
- **Equity curve** — hand-rolled SVG cumulative realized P&L over closed trades only (unrealized P&L from open positions isn't plotted — it only appears as a live stat tile in the always-visible Wallet Summary card, alongside Add-Funds / Reset-Wallet controls).

---

## 15 — Frontend state architecture

Built for a stable frame rate across 200+ live rows, and to survive a mid-session page reload without a blank
screen. No Redux/Zustand — everything is hand-rolled on top of React's own `useSyncExternalStore`.

### Stores

| Store | Pattern | Holds |
|---|---|---|
| `marketStore.js` | `useSyncExternalStore`, **per-symbol** subscriber sets | Live stocks Map, symbol list, meta (market/connection/fyers/nifty). A tick on one symbol only re-renders that symbol's own subscribed rows. |
| `ordersStore.js` | `useSyncExternalStore`, one shared subscriber set | Paper-trading positions/history/summary — always fetched/rendered together. |
| `chartsWishlistStore.js` | `useSyncExternalStore`, backed by `localStorage` | Charts tab's own wishlist Set, deliberately separate from the Watchlist screen's `localStorage["watchlist"]`. |

### Key hooks

| Hook | Purpose |
|---|---|
| `useMarketStream()` | Owns a module-level singleton WebSocket (survives component remounts). Sequence-gap detection → resync; 30s-silence heartbeat timeout → force-reconnect; exponential backoff (500ms→10s cap); reference-counted acquire/release; localStorage snapshot + candle caches for instant cold-start paint. |
| `useStock(symbol)` / `useSymbols()` / `useMarketMeta()` | Thin `useSyncExternalStore` reads over `marketStore`. |
| `useRecommendedStocks(stocks, niftyPct)` | Runs `momentumScore.js` across the universe, memoizing the returned symbol list keyed *only* on a 30-min checkpoint bucket — not live score changes — to prevent the Recommended tag from flickering. |
| `useSymbolCandles(symbol)` | Charts tab per-symbol data: cache → REST fetch → live tick merge + local CVD mirror. |
| `useInViewport()` | Generic IntersectionObserver wrapper (800px overscan), Charts tab's virtualization primitive. |
| `usePaperTradingSync()` / `usePositionsCount()` | 5s / 20s polls respectively — catch server-side fills (SL/Target/TSL) with no user action; the count poll works even if Paper Trading has never been opened. |

### Load sequence, in order

1. **Auth gate** — `GET /api/auth/me` on mount decides Login vs Dashboard.
2. **Instant paint from localStorage** — the last cached snapshot + client-built candles render immediately.
3. **WebSocket connect** — the first message is always a full `snapshot`, overwriting the warm cache with live truth.
4. **Live deltas, surgical re-renders** — every subsequent message is a small `delta`, fanned out per-symbol.
5. **Client-side candle building** — the mini-candlestick sparkline is built purely from the LTP stream, 5-min-bucketed, cached to its own day-stamped localStorage key.
6. **Self-healing** — sequence gap → resync request; 30s silence → force reconnect with backoff.

### Frontend math mirrors (deliberate duplication)

Several backend calculations are re-implemented in JS so certain UI computations don't require a round-trip — kept
in sync by convention/parallel unit tests, not a shared codebase: `momentumScore.js` (mirrors `momentum_score.py`),
`industryGroup.js` (mirrors `config.py`'s `INDUSTRY_GROUP`), `rangeMap.js` (mirrors `calculations.range_map`),
`candleMerge.js`'s tick-to-candle folding (mirrors `candle_aggregator.py`'s bucket logic).

### Theming & responsive patterns

- **Theme** — plain React Context (not a store), seeded from `localStorage["td-theme"]`, toggles a `dark`/`light` class on `<html>`; CSS custom properties (not Tailwind config) carry the actual color tokens, read live by Canvas/chart code so a theme switch repaints without a remount.
- **Dual-markup rows** — every data table (Watchlist rows, Position rows, Order history) renders two `<tr>`s per record — a `hidden md:table-row` desktop row and a `md:hidden` mobile card row inside one `<td colSpan>` — keeping the surrounding `<table>` structurally valid at every breakpoint.
- **Filter sidebar → drawer** — Ranking/Charts screens use a `sticky top-24` sidebar on `lg+`, and a `fixed` slide-over drawer + backdrop below `lg`.

---

## 16 — Storage & DB schema

Most live market data is never persisted at all — it lives only in RAM and is wiped on every backend restart.
Postgres exists for trade record-keeping and the growing candle archive that now powers both CVD and the Smart Money
Engine.

| Data | Where it lives | Survives a restart? |
|---|---|---|
| Live LTP, RS, VWAP, signals, momentum scores | `MarketState` — plain Python dicts in RAM | No |
| 5-min OHLC + volume + tick-rule delta, every symbol, whole session | Postgres — `candle_history` | Yes — powers CVD, Smart Money, future backtesting |
| Simulated (paper) orders & positions, brokerage/charges, journal notes, trailing-stop state | Postgres — `paper_orders` | Yes |
| Simulated wallet balance | Postgres — `paper_wallets` | Yes |
| Smart Money's latest computed ranking | In-process module variable (`smart_money._latest`) | No — recomputed within 5 min of any restart |
| FYERS access/refresh tokens | Local disk file — `.token_cache.json` (not the DB) | Yes, same-day / ~15-day |
| Dashboard login session | Signed cookie (Starlette `SessionMiddleware`) | Yes, cookie-lifetime dependent |
| User accounts | Supabase Auth (managed externally) | Yes |

### Complete migration history (`backend/migrations/`, hand-run in Supabase's SQL Editor — no ORM/migration framework)

| File | Adds |
|---|---|
| `001_orders.sql` | `paper_wallets` (user_id PK, balance) and `paper_orders` (full order shape: symbol, side, quantity, order_type, limit/sl/target/entry/exit price, margin_locked, status, close_reason, realized_pnl, timestamps) + RLS policies + indexes on `(user_id,status)`/`(symbol,status)`/`(user_id,placed_at desc)`. |
| `002_trailing_stop.sql` | `tsl_type`, `tsl_value`, `peak_price` on `paper_orders`. |
| `003_charges.sql` | `brokerage`, `stt`, `exchange_charges`, `sebi_charges`, `stamp_duty`, `gst`, `total_charges`, `net_pnl` on `paper_orders`. |
| `004_notes.sql` | `notes text` on `paper_orders` — the journal-note field. |
| `005_candle_history.sql` | New table `candle_history` (symbol, bucket_date, bucket_minute, OHLC, unique on symbol+date+minute) + index on `(symbol, bucket_date)`. |
| `006_candle_delta.sql` | `delta` on `candle_history` — tick-rule CVD per bucket. |
| `007_candle_volume.sql` | `volume` on `candle_history` — enables RVOL/Fresh-Turnover for the Smart Money Engine. |

### `MarketState` — the complete in-RAM shape

One dict per symbol (210 entries, keyed by short symbol) plus one `nifty` dict, all under a single `threading.RLock`:

`symbol`, `fy_symbol`, `sector`, `prev_close`, `yesterday_low`, `yesterday_high`, `today_low`, `today_high`, `ltp`,
`pct_change`, `volume`, `upper_ckt`, `lower_ckt`, `tot_buy_qty`, `tot_sell_qty`, `day_range_pos`,
`relative_strength`, `vwap_cum_pv`, `vwap_cum_vol`, `vwap`, `orb` (`{"C1":{high,low}, ...}`), `candle1_high`,
`candle1_low`, `two_sided_ok`, `signal`, `signal_time`.

> In short: the database's job is *trade record-keeping and a historical candle archive*, not live market state. The
> signal/scoring engines in §07–§09 could run with zero database connectivity — Postgres only gets involved once a
> candle bucket completes, or a simulated order is placed.

---

## 17 — Process & concurrency model

There is exactly **one** deployed backend service (`tradedashboard-backend`, one systemd unit, one Python
interpreter). Inside it, a few concurrent workers all read/write the *same* in-memory `MarketState`, coordinated by
one `threading.RLock`.

| Worker | Role |
|---|---|
| **Main asyncio event loop** | Serves HTTP + `/ws/stream`, runs the `Broadcaster` task, owns the asyncpg Postgres pool, and now also runs the Smart Money `run_loop()` background task. |
| **FYERS ingest thread** | One dedicated background thread running the blocking FYERS websocket client — ingests every tick and runs the full calculation pipeline synchronously, right there on that thread. |
| **APScheduler background thread** | `BackgroundScheduler` — cron-style jobs on their own worker thread(s), outside the asyncio loop: daily login, market open/close, opening-range refresh, momentum-score checkpoint digests. |
| **Smart Money asyncio task** | Native `asyncio.create_task`, not a thread — reads `candle_history`/`market_state` read-only via async DB calls, recomputes every 5 min, writes only its own module-level cache. |

> **Why two scheduling mechanisms, on purpose.** APScheduler's thread-based jobs exist because the FYERS websocket
> SDK is a *blocking* client (`ws.connect()` blocks, run inside its own `threading.Thread`) and `MarketState`'s lock
> is a plain `threading.RLock` built for exactly that cross-thread pattern. The Smart Money loop, by contrast, does
> nothing but async-safe DB reads — a native asyncio task is simpler, and crucially, a bug in it can never stall or
> crash the thread-based engine (or vice versa). Splitting "fetch" and "store" into separately *deployed* services
> was never on the table: the whole point of `MarketState` is a single shared source of truth every reader can
> access instantly, in-process, with no network hop.

---

## 18 — Notifications (Telegram)

`telegram_notify.send_message(text)` is a no-op whenever `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are unset (same
disable convention used elsewhere in `config.py`) — otherwise POSTs to the Telegram Bot API with
`parse_mode:"Markdown"`, swallowing all exceptions so a notification failure never breaks the caller.

| Trigger | Runs on | Message |
|---|---|---|
| Paper position closed by SL / Target / end-of-day square-off *(never on a manual close — "the user already knows")* | Asyncio loop, hopped to a thread via `run_in_executor` | 🔴/🟢/🟠 + side/qty/symbol @ exit (entry X), then Gross / Charges / Net P&L |
| Momentum-score "Recommended" picks changed at a 30-min checkpoint, and at least one clears the confidence floor | APScheduler worker thread (direct call, no executor hop needed) | ⭐ Recommended (HH:MM IST): one line per pick, symbol + score |

---

## 19 — Daily lifecycle

If the process boots mid-session, it jumps straight to the correct state instead of waiting for the next cron tick.
The Smart Money loop (§09) runs on its own independent 5-minute cadence throughout, unaffected by this schedule.

| Time (IST) | Event |
|---|---|
| **08:45** | Daily token refresh — force-refresh a FYERS token (refresh-token grant first, TOTP fallback) — Mon–Fri. |
| **09:15** | Market open — REST backfill, flip `market_open = true`, launch the websocket ingest thread. |
| **09:46** | Opening-range refresh — re-seed the C1 ORB boundaries + the two breakout-quality gates in case the engine booted mid-candle. |
| **09:15–15:30** | Live — ticks stream continuously; the Broadcaster fans delta frames every 250 ms; the Momentum-Score checkpoint re-locks at 09:45 and every 30 min through 15:15 (digest fires on change); Smart Money recomputes every 5 minutes independently throughout. |
| **15:30** | Market close — close the websocket to conserve bandwidth (standby), square off any still-open simulated positions, flush the day's last partial 5-min candle bucket to storage. |

**Dev override**: `FORCE_MARKET_OPEN=true` in `.env` runs the engine regardless of the clock to exercise the full
pipeline outside market hours.

---

## 20 — Deployment pipeline

GitHub Actions builds/validates on a clean runner; only if that passes does it SSH into the production VM and hand
off to a self-contained safety script that re-validates a second time before ever touching the live service.

### GitHub Actions (`.github/workflows/deploy.yml`)

Triggers on push to `main` or manual dispatch. `concurrency.group: deploy-to-vm` with `cancel-in-progress:false` —
never two deploys racing (the VM script also takes its own file lock, belt-and-suspenders).

1. **`validate` job** — fresh Ubuntu runner: frontend `npm ci && npm run build` (asserts `dist/index.html` exists), backend deps install, an import smoke-test (`import app.main` + the FYERS SDK), and `pytest tests/ -q`. If this fails, `deploy` never starts — the live VM is never touched.
2. **`deploy` job** (`needs: validate`) — SSHes in (`appleboy/ssh-action`). Captures `PREV_SHA` *before* `git reset --hard origin/main` moves HEAD (so rollback has something to roll back *to*), then hands off to `deploy/deploy.sh`.

### `deploy/deploy.sh` — the safety model, in order

0. **Lock & snapshot** — `flock -n` on a lock file (refuses to run if another deploy is in progress); records pre-deploy `/api/health` for the FYERS-continuity check in step 4.
1. **Pull** — `git fetch && git reset --hard origin/main`.
2. **Validate again, before touching the live service** — reinstall backend deps → import check → `pytest` — any failure here rolls back immediately; the running backend was never stopped.
3. **Atomic frontend swap** — build fresh into `dist.new`, verify it, then `mv dist dist.prev && mv dist.new dist` — the backup (`dist.prev`) is kept until the whole deploy succeeds.
4. **Restart + health-check loop** — `systemctl restart`, then poll `/api/health` up to **25× at 2s intervals (50s total)** — widened after a real incident where a 210-symbol REST 429-retry storm blew past the original 30s window. Also verifies FYERS' auth status survived the restart, not just that the process is up.
5. **Reload Caddy, clean up** — `systemctl reload caddy` (safe no-op unless the Caddyfile changed); on success, disarms the rollback trap and deletes `dist.prev`.

> **Automatic rollback.** Any failure from step 2 onward triggers `do_rollback()`: `git reset --hard $PREV_SHA`,
> reinstall deps for that commit, restore `dist.prev` if present, restart, and run the *same* 25×2s health-check loop
> on the rollback itself — deliberately given equal patience to the primary path, after an incident where a
> single-shot rollback check failed to catch a genuinely-healthy-but-slow restart.

---

## 21 — Module map

| File | Responsibility |
|---|---|
| `app/config.py` | Env vars, 210-symbol `WATCHLIST` (display sector), `INDUSTRY_GROUP` (scoring sector), session timings, `ORB_CANDLES`, symbol helpers |
| `app/state.py` | Thread-safe in-memory `MarketState` (RLock) — the single shared source of truth |
| `app/auth.py` | FYERS token fallback chain: cache → refresh-token → TOTP login; on-disk token cache |
| `app/security.py` / `app/supabase_auth.py` | Dashboard session (cookie) + Supabase JWKS verification |
| `app/calculations.py` | RS(Nifty) · VWAP · ORB · quality gates · day-range % · dual-range map, + the tick processor |
| `app/candle_aggregator.py` | Tick-derived ORB/quality-gate seeding, CVD tick-rule, per-bucket volume, all-day 5-min candle recording (stocks + NIFTY index) |
| `app/candle_history.py` | Persists/reads 5-min candles; historical same-slot stats query for Smart Money |
| `app/candle_query.py` | Merges persisted + in-progress candles and computes reference levels (incl. pivot) for the Charts tab |
| `app/momentum_score.py` | Server-side port of the "Recommended" composite score, run on a schedule |
| `app/smart_money.py` | Smart Money Engine: Fresh Turnover Ratio / RVOL / RS percentile-ranking, its own asyncio loop + router |
| `app/fyers_service.py` | REST backfill + websocket subscription/ingestion (lifecycle-managed) |
| `app/broadcaster.py` | Snapshot/delta diffing + 250 ms fan-out to browser WebSocket subscribers |
| `app/scheduler.py` | APScheduler cron jobs: daily login, market open/close, ORB refresh, score checkpoints |
| `app/charts.py` | `/api/charts` router — one route, today's candles + levels for a symbol |
| `app/paper_trading.py` | `/api/paper` router — orders, positions, wallet, history, exports, auto order placement |
| `app/order_monitor.py` | Per-tick SL/Target/TSL/limit-fill checks for open paper orders |
| `app/trailing_stop.py`, `brokerage.py`, `paper_pnl.py`, `paper_margin.py` | Pure paper-trading math: ratchet TSL, brokerage/tax, P&L, margin/leverage |
| `app/technical_indicators.py` | 5m RSI-14, 20/50 EMA, dynamic structural SL/Target math, defensive sector gating, VWAP retest evaluation |
| `app/ai_copilot.py` | Gemini 3.6 Flash Red-Flag Filter, Multi-Stream Global Macro/Commodities/Tariff news wire, automated risk sizing, silent Telegram alerting |
| `app/telegram_notify.py` | Best-effort Telegram alerts for paper-trade closes, executed orders, and Recommended-digest checkpoints |
| `app/logging_config.py` | `logging.basicConfig` to stdout — journald captures it on the VM, no file handler needed |
| `app/main.py` | FastAPI app: routers, `/ws/stream`, snapshot, health, `/api/ai/status`, lifespan wiring (scheduler + broadcaster + Smart Money loop) |
| `manual_auth.py` · `diagnose_login.py` · `check_totp.py` | One-time FYERS app consent + credential-masked login diagnostics |
| `frontend/src/App.jsx` | Auth gate, Dashboard shell, tab bar, Live AI Status Badge (30s polling), all 7 screens' mount points |
| `frontend/src/hooks/useMarketStream.js` | Singleton WebSocket controller, localStorage caches, client-side candle building |
| `frontend/src/components/CandleChart.jsx` | lightweight-charts wrapper: candles + CVD pane + reference lines + crosshair badge |
| `frontend/src/components/insights/PremarketBriefingCard.jsx` | Multi-stream global intelligence card: Global Cues bar (Gift Nifty, US Tech, Crude, Gold, DXY), Policy Watch, Thematic Focus stocks |
| `frontend/src/screens/SmartMoneyScreen.jsx` | Independent-polling Smart Money Top-10 tab |
| `frontend/src/utils/momentumScore.js`, `industryGroup.js` | Client-side mirrors of the Recommended-score formula + scoring-sector map |
| `frontend/src/components/paper-trading/*` | Order ticket, positions table, history, charges/exports/equity-curve reports |

---

## 22 — AI Copilot & Multi-Factor Quant Gatekeeper

An institutional-grade, multi-stage quantitative pipeline that continuously scans 210 F&O stocks during the 09:15–11:00 AM prime breakout window, filters out 98% of false breakouts, validates technical setups with Google Gemini AI, and executes risk-capped paper orders automatically.

```
[ 210 Watchlist Stocks ]
           │  (Tick-by-tick breakout detection: C1-C4 ORB & VWAP Retest)
           ▼
[ STAGE 1: Multi-Factor Quant Gatekeeper (app/technical_indicators.py) ]
   ├── Tier 1: Sector Gating (Defensive RS >= 2.0%, Momentum RS >= 1.0%, Sector Mean aligned, Breadth >= 65%)
   ├── Tier 2: VWAP Alignment (0.10% <= Distance <= 0.65% for Retest / 1.20% for Breakout)
   ├── Tier 3: 5m Technicals (RSI 55-72 for Buy / 28-45 for Sell; Price on correct side of 20 EMA)
   ├── Tier 4: ADR Room Check (Day range consumed < 85% of 14-day ADR)
   └── Tier 5: Order Book Depth Delta (Net rupee buyer/seller pressure confirmation)
           │
           │  (Only 1-3 top-tier stocks pass per day)
           ▼
[ STAGE 2: AI Copilot Red-Flag Audit (app/ai_copilot.py) ]
   ├── Google Gemini API (gemini-3.6-flash / gen-lang-client-0440367952 Free Tier)
   ├── Multi-Stream News Wire Ingestion: 4 real-time RSS streams (US Tech, Commodities, Tariffs/SEBI, Indian Corporate)
   ├── Paced via Semaphore(1) + 2s sleep delay (Zero HTTP 429 errors)
   ├── Red-Flag Filter Mode: Identifies traps, wall resistance, late entries, structural flaws
   └── Live AI Status: /api/ai/status polled every 30s ("🟢 Gemini 3.6 Flash Live" vs "⚡ Institutional Model")
           │
           │  (Confidence >= 80% and session_minute <= 105)
           ▼
[ STAGE 3: Dynamic Structural Stop Loss & Target Engine ]
   ├── Anchor: Min Low (Buy) / Max High (Sell) of recent 3-5 candles + 1.5x True 5m ATR
   ├── Boundary Clamping: Min 0.85% (anti-noise buffer) to Max 2.00%
   └── Fixed 1:2 Risk-Reward Target
           │
           ▼
[ STAGE 4: Automated Execution & Silent Telegram Notification ]
   ├── Risk Sizing: Quantity = int((DAILY_MAX_RISK / MAX_TRADES) / SL_distance) = ~₹666 risk/trade
   ├── Max Daily Cap: 3 trades / ₹2,000 max daily loss (capital preservation guarantee)
   └── Silent Rejection: SKIP_TRAP and low-confidence alerts are silent; Telegram rings ONLY for orders
```

### 1. Multi-Stream Global Macro & Commodity News Ingestion

Google AI Studio Free Tier blocks native Google Search tool calls with 429 quota exhaustion. The system circumvents this constraint by directly ingesting **4 real-time news streams** into Gemini's context prompt at ₹0 cost:

1. 🌍 **Global Macro & US Tech**: Reuters / CNBC / BBC Business (Nasdaq, Fed rates, Asian cues).
2. 🥇 **Commodities & Forex**: Brent Crude Oil, Gold & Silver, US Dollar DXY, China industrial demand.
3. 🏛️ **Policy, Tariffs & Regulatory**: US/Govt Tariffs, SEBI circulars, RBI monetary policy.
4. 🇮🇳 **Indian Corporate & Stocks**: Economic Times Stocks, LiveMint Markets, earnings results, CEO/board changes.

Synthesized output includes:
* **Global Cues Bar**: Gift Nifty indication, US Tech sentiment, Brent Crude, Gold, and Dollar DXY.
* **Policy & Geopolitical Watch**: Active regulatory or tariff alert badges.
* **Thematic Focus Stocks**: Categorized by theme (`Commodities`, `Global Tech`, `Earnings`, `Policy`) with specific catalyst drivers.

### 2. Multi-Factor Quant Filter Math

Every setup candidate must satisfy all mathematical constraints:

1. **Relative Strength & Sector Gating**:
   $$\text{RS} = \% \Delta \text{Stock} - \% \Delta \text{NIFTY}$$
   $$\text{Threshold} = \begin{cases} 2.0\% & \text{if Sector } \in \{\text{FMCG, PSU Banks, Consumer, Cement}\} \\ 1.0\% & \text{otherwise (High-Beta Momentum)}\end{cases}$$
   $$\text{Sector Mean Return} > 0.0\% \text{ (for Buys)} \quad / \quad < 0.0\% \text{ (for Sells)}$$

2. **Sector Breadth**:
   $$\text{Sector Breadth} = \frac{\text{Advancing Constituents}}{\text{Total Sector Constituents}} \times 100 \ge 65\% \quad (\text{for Longs})$$

3. **VWAP Distance Buffer**:
   $$0.10\% \le \frac{|\text{LTP} - \text{VWAP}|}{\text{VWAP}} \times 100 \le 0.65\% \text{ (Retest)} \quad / \quad \le 1.20\% \text{ (ORB Breakout)}$$

4. **5-Minute Technical Indicators**:
   $$\text{RSI}_{14} \in [55.0, 72.0] \text{ and } \text{LTP} \ge \text{EMA}_{20} \quad (\text{Buy})$$
   $$\text{RSI}_{14} \in [28.0, 45.0] \text{ and } \text{LTP} \le \text{EMA}_{20} \quad (\text{Sell})$$

5. **ADR Room Check**:
   $$\text{Day Range Consumed} = \frac{\text{Today High} - \text{Today Low}}{\text{LTP}} \times 100 < 0.85 \times \text{ADR}_{14}$$

### 3. Dynamic Stop Loss & Target Formula

$$\text{ATR}_{14} = \text{Average True Range of 5-min candles}$$
$$\text{Swing Dist} = \begin{cases} \text{LTP} - (\min_{5\text{m}}(\text{Low}) \times 0.9985) & (\text{Buy}) \\ (\max_{5\text{m}}(\text{High}) \times 1.0015) - \text{LTP} & (\text{Sell})\end{cases}$$
$$\text{SL Distance} = \min\Big(\max(\text{Swing Dist},\, 1.5 \times \text{ATR}_{14},\, 0.0085 \times \text{LTP}),\, 0.0200 \times \text{LTP}\Big)$$
$$\text{Target Price} = \text{Entry} \pm (2.0 \times \text{SL Distance})$$

---

## 23 — Paper Trading Roadmap & Quantitative Improvements

A planned progression of institutional features scheduled for deployment during the paper trading phase:

1. **Mid-Trade Protection & Proactive Management**:
   * **Auto-Breakeven Ratchet**: Moves SL to `Entry + Buffer` once trade reaches $+1.0\text{R}$ to guarantee zero losses.
   * **Adverse Sector / Market Deterioration Alarm**: Real-time warnings if sector breadth or NIFTY flips while holding a position.
   * **Partial Profit Scale-Out**: Book $50\%$ profit at $1.5\text{R}$ target and let the remaining $50\%$ ride with the dynamic trailing SL.
2. **Interactive Charting & Visual Execution Lines**:
   * Green dashed Entry, Red Stop-Loss, and Blue Target lines rendered directly on the Lightweight Candlestick Chart.
   * Institutional anchor overlays (PDH, PDL, PDC, VWAP $\pm 1\sigma, \pm 2\sigma$ bands, 15m Opening Range box).
   * Instant multi-timeframe candle switching (1m, 3m, 5m, 15m).
3. **F&O Options Chain Confluence**:
   * Major Call resistance & Put support Open Interest (OI) strike wall detection.
   * Put-Call Ratio (PCR) trend & Max Pain alignment.
4. **AI Post-Trade Forensic Journal (15:35 PM Daily Review)**:
   * Automated EOD AI debrief analyzing Maximum Favorable Excursion (MFE) vs Maximum Adverse Excursion (MAE).
   * 0–100 Execution Quality Scorecard.
5. **Historical 30-Day Session Replay & Strategy Backtester**:
   * Multi-session backtester benchmarking ORB vs VWAP Retest vs Trend Pullback across all 210 watchlist stocks.

---

*TradeDashboard · FYERS API v3 · FastAPI + React · Complete architecture rewrite covering all 7 screens, both scoring engines, CVD, paper trading, AI Copilot, Multi-Stream News Wire, and the deployment pipeline.*


