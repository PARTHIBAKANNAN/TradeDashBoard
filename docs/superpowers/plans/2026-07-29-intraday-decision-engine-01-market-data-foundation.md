# Market Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add canonical tick/candle models, freshness tracking, SQLite persistence, and historical volume baselines while keeping the existing scanner runnable.

**Architecture:** FYERS messages are normalized once into immutable ticks. A market service updates the existing live state, aggregates one- and five-minute candles, persists completed five-minute candles, and exposes immutable snapshots for later decision-engine plans. SQLite uses the standard library, WAL mode, explicit migrations, and idempotent upserts.

**Tech Stack:** Python 3.11+, FastAPI, pytest, standard-library `sqlite3`, dataclasses, existing FYERS API v3 client.

## Global Constraints

- Preserve the existing curated 169-stock universe and NIFTY 50 benchmark.
- Keep FYERS credentials, tokens, and sockets backend-only.
- Do not store raw ticks.
- Retain completed five-minute candles for 180 trading days.
- Use one writer process; SQLite must run in WAL mode.
- Live price delivery must remain functional throughout this plan.
- Every new behavior is test-first; do not require live broker credentials in tests.

## File Structure

- `backend/requirements-dev.txt` — local/test-only Python dependencies.
- `backend/app/market/models.py` — immutable tick, candle, and snapshot contracts.
- `backend/app/market/normalize.py` — defensive FYERS-message normalization.
- `backend/app/market/candles.py` — one- and five-minute OHLCV/VWAP aggregation.
- `backend/app/market/baselines.py` — 20-session cumulative-volume baselines.
- `backend/app/market/service.py` — coordinates live state, candles, and persistence.
- `backend/app/storage/database.py` — connections, WAL settings, and migrations.
- `backend/app/storage/migrations.py` — ordered schema definitions.
- `backend/app/storage/repository.py` — candle and baseline persistence.
- `backend/app/state.py` — existing live state plus freshness and immutable snapshots.
- `backend/app/fyers_service.py` — REST/tick adapter into the market service.
- `backend/app/main.py` — richer health and snapshot metadata.

---

### Task 1: Establish the backend test harness and data settings

**Files:**
- Create: `backend/requirements-dev.txt`
- Create: `backend/pytest.ini`
- Create: `backend/tests/test_market_config.py`
- Modify: `backend/app/config.py:28-49`
- Modify: `backend/.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: existing `app.config`.
- Produces: `DATABASE_FILE: str`, `CANDLE_RETENTION_SESSIONS: int`, `FEATURE_INTERVAL: float`, `LIVE_BROADCAST_INTERVAL: float`, `FEED_STALE_SECONDS: int`, and `SYMBOL_STALE_SECONDS: int`.

- [ ] **Step 1: Add and install the development test harness**

```text
# backend/requirements-dev.txt
-r requirements.txt
pytest>=8.3,<9
pytest-asyncio>=0.25,<1
httpx>=0.28,<1
```

```ini
# backend/pytest.ini
[pytest]
markers =
    slow: opt-in load or long-running acceptance test
```

Run: `cd backend; .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt`

Expected: installation succeeds.

- [ ] **Step 2: Write the failing configuration test**

```python
# backend/tests/test_market_config.py
from pathlib import Path

from app import config


def test_market_data_defaults_are_safe():
    assert Path(config.DATABASE_FILE).is_absolute()
    assert config.CANDLE_RETENTION_SESSIONS == 180
    assert config.FEATURE_INTERVAL == 5.0
    assert config.LIVE_BROADCAST_INTERVAL == 0.25
    assert config.FEED_STALE_SECONDS == 10
    assert config.SYMBOL_STALE_SECONDS == 30
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_market_config.py -q`

Expected: FAIL because the new configuration names do not exist.

- [ ] **Step 4: Add market-data configuration**

```python
# backend/app/config.py
DATABASE_FILE = os.path.abspath(
    os.getenv("DATABASE_FILE", os.path.join(os.path.dirname(__file__), "..", "market.db"))
)
CANDLE_RETENTION_SESSIONS = int(os.getenv("CANDLE_RETENTION_SESSIONS", "180"))
FEATURE_INTERVAL = float(os.getenv("FEATURE_INTERVAL", "5.0"))
LIVE_BROADCAST_INTERVAL = float(os.getenv("LIVE_BROADCAST_INTERVAL", "0.25"))
FEED_STALE_SECONDS = int(os.getenv("FEED_STALE_SECONDS", "10"))
SYMBOL_STALE_SECONDS = int(os.getenv("SYMBOL_STALE_SECONDS", "30"))
```

Add the same variables and defaults to `backend/.env.example`, with
`DATABASE_FILE=/data/market.db` documented for deployment.

Add runtime database files to `.gitignore`:

```gitignore
backend/*.db
backend/*.db-wal
backend/*.db-shm
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_market_config.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitignore backend/requirements-dev.txt backend/pytest.ini backend/tests/test_market_config.py backend/app/config.py backend/.env.example
git commit -m "test: establish market data test harness"
```

### Task 2: Add canonical tick and candle aggregation

**Files:**
- Create: `backend/app/market/__init__.py`
- Create: `backend/app/market/models.py`
- Create: `backend/app/market/candles.py`
- Create: `backend/tests/test_candles.py`

**Interfaces:**
- Consumes: timezone-aware `datetime` values in IST.
- Produces:
  - `Tick(symbol: str, at: datetime, ltp: float, cumulative_volume: int, day_high: float, day_low: float, prev_close: float)`
  - `Candle(symbol: str, timeframe: str, started_at: datetime, open: float, high: float, low: float, close: float, volume: int, vwap: float, complete: bool)`
  - `StockSnapshot` and `MarketSnapshot`
  - `CandleAggregator.apply(tick: Tick) -> tuple[Candle, ...]`
  - `CandleAggregator.current(symbol: str, timeframe: str) -> Candle | None`

- [ ] **Step 1: Write failing candle tests**

```python
# backend/tests/test_candles.py
from datetime import datetime

from app.config import IST
from app.market.candles import CandleAggregator
from app.market.models import Tick


def tick(minute, second, price, volume):
    return Tick(
        symbol="TCS",
        at=IST.localize(datetime(2026, 7, 29, 9, minute, second)),
        ltp=price,
        cumulative_volume=volume,
        day_high=price,
        day_low=price,
        prev_close=3000.0,
    )


def test_one_minute_candle_closes_on_next_bucket():
    agg = CandleAggregator()
    assert agg.apply(tick(15, 1, 100.0, 100)) == ()
    assert agg.apply(tick(15, 40, 102.0, 130)) == ()
    closed = agg.apply(tick(16, 0, 101.0, 160))
    one_minute = [c for c in closed if c.timeframe == "1m"][0]
    assert (one_minute.open, one_minute.high, one_minute.low, one_minute.close) == (
        100.0, 102.0, 100.0, 102.0
    )
    assert one_minute.volume == 30


def test_volume_reset_never_creates_negative_volume():
    agg = CandleAggregator()
    agg.apply(tick(15, 1, 100.0, 1000))
    agg.apply(tick(15, 20, 101.0, 10))
    current = agg.current("TCS", "1m")
    assert current.volume == 0
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_candles.py -q`

Expected: FAIL because `app.market` does not exist.

- [ ] **Step 3: Implement immutable models and aggregation**

```python
# backend/app/market/models.py
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class Tick:
    symbol: str
    at: datetime
    ltp: float
    cumulative_volume: int
    day_high: float
    day_low: float
    prev_close: float


@dataclass(frozen=True, slots=True)
class Candle:
    symbol: str
    timeframe: str
    started_at: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    vwap: float
    complete: bool


@dataclass(frozen=True, slots=True)
class StockSnapshot:
    symbol: str
    sector: str
    ltp: float
    prev_close: float
    pct_change: float
    day_high: float
    day_low: float
    cumulative_volume: int
    vwap: float | None
    last_tick_at: datetime | None
    age_seconds: float | None


@dataclass(frozen=True, slots=True)
class MarketSnapshot:
    at: datetime
    market_open: bool
    feed_age_seconds: float | None
    nifty: StockSnapshot
    stocks: tuple[StockSnapshot, ...]
```

Implement `CandleAggregator` with bucket sizes `1m` and `5m`. Track the prior
cumulative volume per symbol, clamp negative deltas to zero, and calculate
VWAP as `sum(ltp * incremental_volume) / sum(incremental_volume)`, falling back
to the candle close when volume is zero. Return immutable completed candles
when a tick enters a new bucket.

- [ ] **Step 4: Run the focused and existing calculation tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_candles.py tests/test_calculations.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/market backend/tests/test_candles.py
git commit -m "feat: aggregate canonical intraday candles"
```

### Task 3: Add SQLite migrations and candle persistence

**Files:**
- Create: `backend/app/storage/__init__.py`
- Create: `backend/app/storage/migrations.py`
- Create: `backend/app/storage/database.py`
- Create: `backend/app/storage/repository.py`
- Create: `backend/tests/test_repository.py`

**Interfaces:**
- Consumes: `app.market.models.Candle`.
- Produces:
  - `Database(path: str).migrate() -> None`
  - `Database.connection() -> ContextManager[sqlite3.Connection]`
  - `MarketRepository.upsert_candles(candles: Iterable[Candle]) -> None`
  - `MarketRepository.load_candles(symbol: str, timeframe: str, start: datetime, end: datetime) -> list[Candle]`
  - `MarketRepository.retention_cutoff(keep_sessions: int) -> datetime | None`
  - `MarketRepository.prune_candles(before: datetime) -> int`

- [ ] **Step 1: Write failing repository tests**

```python
# backend/tests/test_repository.py
from datetime import datetime

from app.config import IST
from app.market.models import Candle
from app.storage.database import Database
from app.storage.repository import MarketRepository


def test_migration_enables_wal_and_candle_upsert(tmp_path):
    db = Database(str(tmp_path / "market.db"))
    db.migrate()
    repo = MarketRepository(db)
    at = IST.localize(datetime(2026, 7, 29, 9, 15))
    candle = Candle("TCS", "5m", at, 100, 103, 99, 102, 5000, 101.4, True)
    repo.upsert_candles([candle, candle])
    loaded = repo.load_candles("TCS", "5m", at, at)
    assert loaded == [candle]
    with db.connection() as conn:
        assert conn.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_repository.py -q`

Expected: FAIL because `app.storage` does not exist.

- [ ] **Step 3: Implement migration 1 and repository methods**

```python
# backend/app/storage/migrations.py
MIGRATIONS = {
    1: """
    CREATE TABLE IF NOT EXISTS candles (
        symbol TEXT NOT NULL,
        timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m')),
        started_at TEXT NOT NULL,
        open REAL NOT NULL,
        high REAL NOT NULL,
        low REAL NOT NULL,
        close REAL NOT NULL,
        volume INTEGER NOT NULL,
        vwap REAL NOT NULL,
        complete INTEGER NOT NULL,
        PRIMARY KEY (symbol, timeframe, started_at)
    );
    CREATE INDEX IF NOT EXISTS ix_candles_time
        ON candles(timeframe, started_at);
    """,
}
```

`Database.connection()` must open one connection per operation with
`timeout=10`, `row_factory=sqlite3.Row`, `PRAGMA foreign_keys=ON`, and
`PRAGMA busy_timeout=5000`. `migrate()` must set `journal_mode=WAL`, run each
missing migration in one transaction, and update `PRAGMA user_version`.

`MarketRepository.upsert_candles()` must use one `executemany()` statement with
`ON CONFLICT(symbol, timeframe, started_at) DO UPDATE`. Convert datetimes to
ISO-8601 strings and back without dropping timezone offsets.

- [ ] **Step 4: Run repository tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_repository.py -q`

Expected: PASS, including the WAL assertion and idempotent upsert.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage backend/tests/test_repository.py
git commit -m "feat: persist completed market candles"
```

### Task 4: Normalize FYERS messages and integrate the market service

**Files:**
- Create: `backend/app/market/normalize.py`
- Create: `backend/app/market/service.py`
- Create: `backend/tests/test_market_service.py`
- Modify: `backend/app/state.py:14-67`
- Modify: `backend/app/fyers_service.py:282-302`
- Modify: `backend/app/calculations.py:101-136`

**Interfaces:**
- Consumes:
  - `normalize_fyers_tick(message: dict, received_at: datetime) -> Tick | None`
  - `CandleAggregator.apply(Tick) -> tuple[Candle, ...]`
  - `MarketRepository.upsert_candles(...)`
- Produces:
  - `MarketService.process_tick(tick: Tick) -> tuple[Candle, ...]`
  - `MarketState.snapshot(now: datetime) -> MarketSnapshot`
  - `MarketSnapshot.feed_age_seconds`, per-symbol `age_seconds`, cumulative
    volume, VWAP, and latest one-/five-minute candle.

- [ ] **Step 1: Write failing normalization and integration tests**

```python
# backend/tests/test_market_service.py
from datetime import datetime

from app.config import IST
from app.market.normalize import normalize_fyers_tick


def test_normalizer_accepts_fyers_volume_and_timestamp_variants():
    received = IST.localize(datetime(2026, 7, 29, 9, 15, 2))
    tick = normalize_fyers_tick(
        {
            "symbol": "NSE:TCS-EQ",
            "ltp": 3201.5,
            "vol_traded_today": 1200,
            "high_price": 3210,
            "low_price": 3190,
            "prev_close_price": 3180,
            "timestamp": int(received.timestamp()),
        },
        received,
    )
    assert tick.symbol == "TCS"
    assert tick.cumulative_volume == 1200
    assert tick.at == received


def test_normalizer_rejects_messages_without_symbol_or_price():
    now = IST.localize(datetime(2026, 7, 29, 9, 15))
    assert normalize_fyers_tick({"ltp": 100}, now) is None
    assert normalize_fyers_tick({"symbol": "NSE:TCS-EQ"}, now) is None
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_market_service.py -q`

Expected: FAIL because the normalizer and service are missing.

- [ ] **Step 3: Implement normalization and the orchestration boundary**

```python
# backend/app/market/normalize.py
from datetime import datetime

from app.config import BENCHMARK_SYMBOL, IST, short_symbol
from app.market.models import Tick


def normalize_fyers_tick(message: dict, received_at: datetime) -> Tick | None:
    fy_symbol = message.get("symbol")
    ltp = message.get("ltp") or message.get("last_traded_price")
    if not fy_symbol or ltp is None:
        return None
    raw_ts = message.get("timestamp") or message.get("exchange_timestamp")
    at = datetime.fromtimestamp(raw_ts, IST) if raw_ts else received_at
    symbol = "NIFTY50" if fy_symbol == BENCHMARK_SYMBOL else short_symbol(fy_symbol)
    return Tick(
        symbol=symbol,
        at=at,
        ltp=float(ltp),
        cumulative_volume=int(
            message.get("vol_traded_today") or message.get("volume") or 0
        ),
        day_high=float(message.get("high_price") or message.get("high") or ltp),
        day_low=float(message.get("low_price") or message.get("low") or ltp),
        prev_close=float(
            message.get("prev_close_price") or message.get("prev_close") or 0
        ),
    )
```

`MarketService.process_tick()` must update NIFTY or the existing stock state,
apply the tick to `CandleAggregator`, persist only completed five-minute
candles, and return all completed candles for downstream listeners. Move the
mutation work currently in `process_incoming_tick()` behind this service while
keeping a temporary compatibility wrapper so existing callers and tests pass.

Change `DataEngine._handle_tick()` to normalize once and call the service.
Inject the service into `DataEngine` so tests can use fakes without importing
the FYERS SDK.

- [ ] **Step 4: Run focused and regression tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_market_service.py tests/test_candles.py tests/test_calculations.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/market backend/app/state.py backend/app/fyers_service.py backend/app/calculations.py backend/tests/test_market_service.py
git commit -m "refactor: route FYERS ticks through market service"
```

### Task 5: Backfill five-minute history and calculate volume baselines

**Files:**
- Create: `backend/app/market/baselines.py`
- Create: `backend/tests/test_volume_baselines.py`
- Modify: `backend/app/fyers_service.py:103-232`
- Modify: `backend/app/storage/repository.py`

**Interfaces:**
- Consumes: persisted complete five-minute candles.
- Produces:
  - `MarketRepository.distinct_sessions(symbol: str, before: date, limit: int) -> list[date]`
  - `VolumeBaseline.expected_cumulative(symbol: str, at: time) -> int | None`
  - `VolumeBaseline.relative_volume(symbol: str, at: datetime, actual: int) -> float | None`

- [ ] **Step 1: Write the failing baseline test**

```python
# backend/tests/test_volume_baselines.py
from datetime import date, time

from app.market.baselines import cumulative_median


def test_cumulative_median_uses_same_elapsed_session_time():
    sessions = [
        [(time(9, 15), 100), (time(9, 20), 250)],
        [(time(9, 15), 120), (time(9, 20), 300)],
        [(time(9, 15), 80), (time(9, 20), 200)],
    ]
    assert cumulative_median(sessions, time(9, 20)) == 250


def test_baseline_requires_ten_sessions():
    assert cumulative_median([[(time(9, 15), 100)]] * 9, time(9, 15)) is None
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_volume_baselines.py -q`

Expected: FAIL because baseline calculation is missing.

- [ ] **Step 3: Implement baseline calculation and backfill**

```python
# backend/app/market/baselines.py
from datetime import time
from statistics import median


def cumulative_median(
    sessions: list[list[tuple[time, int]]], at: time
) -> int | None:
    if len(sessions) < 10:
        return None
    totals = []
    for rows in sessions[-20:]:
        totals.append(sum(volume for bucket, volume in rows if bucket <= at))
    return int(median(totals))
```

Extend `DataEngine.backfill()` to request five-minute candles for the previous
20 valid sessions plus today, map FYERS candle arrays into `Candle` objects,
and upsert them in bounded, paced batches. Do not block startup indefinitely:
return a structured coverage result with successful/attempted symbol counts.

Add repository queries that group complete five-minute candles by IST session
date. The baseline service must use at most the previous 20 sessions and return
`None` below ten sessions.

- [ ] **Step 4: Run baseline, repository, and service tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_volume_baselines.py tests/test_repository.py tests/test_market_service.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/market/baselines.py backend/app/fyers_service.py backend/app/storage/repository.py backend/tests/test_volume_baselines.py
git commit -m "feat: backfill relative volume history"
```

### Task 6: Expose freshness, coverage, and persistence health

**Files:**
- Create: `backend/app/health.py`
- Create: `backend/tests/test_health.py`
- Modify: `backend/app/state.py`
- Modify: `backend/app/main.py:31-64,157-164`
- Modify: `backend/app/scheduler.py:36-64,90-132`

**Interfaces:**
- Consumes: `MarketState.snapshot(now)`, backfill coverage, database probe.
- Produces:
  - `build_health(...) -> dict`
  - `/api/health` fields `broker`, `feed`, `database`, `coverage`, `last_evaluation`.
  - `/api/snapshot` fields `server_time`, `feed_age_seconds`, and stock-level `age_seconds`, `volume`, `vwap`.

- [ ] **Step 1: Write the failing health contract test**

```python
# backend/tests/test_health.py
from app.health import build_health


def test_health_reports_subsystems():
    body = build_health(
        broker_authenticated=False,
        feed_running=False,
        feed_age_seconds=None,
        database_ok=True,
        coverage={"successful": 0, "attempted": 169},
        last_evaluation=None,
    )
    assert {"broker", "feed", "database", "coverage", "last_evaluation"} <= body.keys()
    assert body["feed"]["status"] in {"live", "stale", "offline"}
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_health.py -q`

Expected: FAIL because the health response lacks subsystem fields.

- [ ] **Step 3: Add snapshot freshness and structured health**

Implement a `MarketState.snapshot(now)` method that copies state under one lock
and calculates ages after releasing the lock. `build_payload()` must consume
that snapshot instead of reaching into mutable dictionaries directly.

Implement `build_health()` as a pure function and have the route supply current
auth, engine, snapshot, repository, coverage, and evaluator values. Use explicit
feed rules:

```python
feed_status = (
    "offline" if not feed_running
    else "stale" if feed_age_seconds is None
    or feed_age_seconds > config.FEED_STALE_SECONDS
    else "live"
)
database_status = "ok" if database_ok else "degraded"
```

Have scheduler startup call `database.migrate()` before backfill and record
backfill coverage. Retention is based on distinct IST trading sessions, not
calendar days:

```python
cutoff = repository.retention_cutoff(config.CANDLE_RETENTION_SESSIONS)
if cutoff is not None:
    repository.prune_candles(before=cutoff)
```

Failure must leave the service up with `database=degraded`.

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests -q`

Expected: PASS with no broker credentials or network access.

- [ ] **Step 5: Run a manual local smoke check**

Run with `DATA_ENGINE_ENABLED=false`:

```powershell
cd backend
$env:DATA_ENGINE_ENABLED='false'
.\.venv\Scripts\python.exe run.py
```

In a second terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

Expected: HTTP 200; feed is `offline`, database is `ok`, and the service does
not attempt to open a FYERS WebSocket.

- [ ] **Step 6: Commit**

```bash
git add backend/app/health.py backend/app/state.py backend/app/main.py backend/app/scheduler.py backend/tests/test_health.py
git commit -m "feat: report market data freshness and health"
```

## Plan 1 Completion Gate

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests -q
```

Verify:

- Existing snapshot fields still render the current scanner.
- Completed five-minute candles survive a restart.
- Duplicate candle ingestion is idempotent.
- No raw-tick table exists.
- Health clearly distinguishes offline, stale, and live data.

Proceed to Plan 2 only after this gate passes.
