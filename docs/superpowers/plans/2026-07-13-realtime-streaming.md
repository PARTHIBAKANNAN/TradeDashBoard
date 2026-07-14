# Real-time streaming redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 1-second SSE full-snapshot stream with a 250 ms WebSocket delta stream fanned out from a single shared broadcaster, so price updates feel live (sub-300 ms) and backend CPU is O(1) in the number of connected clients.

**Architecture:** A single `asyncio` background task on the backend snapshots `market_state` every 250 ms, diffs it against the previous snapshot, serializes one JSON frame, and fans it out to a bounded `asyncio.Queue` per WebSocket subscriber. The React frontend maintains a per-symbol store behind `useSyncExternalStore` so only rows whose data changed re-render. `range_map` moves from the server to the browser (10 lines of JS).

**Tech Stack:** Python 3.11+ / FastAPI (backend), React 18 (frontend), Vite, Vitest (new — frontend tests). No new production dependencies on the backend.

**Spec:** [`docs/superpowers/specs/2026-07-13-realtime-streaming-design.md`](../specs/2026-07-13-realtime-streaming-design.md)

## Global Constraints

- WebSocket endpoint path: **`/ws/stream`**. HTTP SSE endpoint `/api/stream` is **removed**.
- Broadcast cadence: `STREAM_INTERVAL` default **`0.25`** seconds (was `1.0`).
- Per-subscriber queue size: `BROADCAST_MAX_QUEUE` default **`8`** (new env var).
- Auth: reuse existing `security.is_authenticated(...)` (session cookie). On WS: reject unauthenticated with close code **`4401`** before subscribing.
- Wire format: **JSON**. Two frame types only: `"snapshot"` and `"delta"`. Both carry a strictly-increasing integer `seq` (starting at `1` per server run).
- Empty diff → `_build_frame` returns `None`; nothing is sent that tick (WS-level pings handle liveness).
- On subscriber `QueueFull`: drain that queue, put a fresh **`snapshot`** frame instead (silent resync).
- No new backend Python dependencies. Frontend adds only `vitest` and `jsdom` as devDependencies.
- Preserve existing `security.is_authenticated`, existing math (`app/calculations.py`), and existing FYERS ingestion — only the streaming layer changes.

---

## File Structure

**Backend — created:**
- `backend/app/broadcaster.py` — `Broadcaster` class + pure `build_frame()` helper.
- `backend/tests/test_broadcaster.py` — unit tests for the differ and the fan-out.

**Backend — modified:**
- `backend/app/config.py` — `STREAM_INTERVAL` default → `0.25`; add `BROADCAST_MAX_QUEUE`.
- `backend/app/main.py` — remove `GET /api/stream` (SSE); add `WebSocket /ws/stream`; start/stop broadcaster in lifespan; strip `range_map` from `/api/snapshot` payload.

**Frontend — created:**
- `frontend/src/lib/rangeMap.js` — pure JS mirror of Python `range_map`.
- `frontend/src/lib/rangeMap.test.js` — Vitest test.
- `frontend/src/store/marketStore.js` — Map-backed per-symbol store with subscribe API.
- `frontend/src/store/marketStore.test.js` — Vitest test.
- `frontend/vitest.config.js` — Vitest config.

**Frontend — modified:**
- `frontend/package.json` — add `vitest`, `jsdom` devDeps and `test` script.
- `frontend/src/hooks/useMarketStream.js` — rewritten as WebSocket client + hooks (`useStock`, `useMarketMeta`, `useSymbols`).
- `frontend/src/components/WatchlistRow.jsx` — receives only `symbol`, reads via `useStock(symbol)`, computes `rangeMap` inline.
- `frontend/src/App.jsx` — reads meta via `useMarketMeta()`, sort/filter operates on `useSymbols()` + minimal projection.

---

## Task 1: Backend — pure `build_frame()` differ (TDD)

**Files:**
- Create: `backend/app/broadcaster.py`
- Create: `backend/tests/test_broadcaster.py`

**Interfaces:**
- Consumes: nothing (pure function over dicts).
- Produces:
  - `snapshot_from_state(market_state) -> dict` — helper that reads `market_state` under its lock and returns a plain-dict snapshot with keys: `market_open: bool`, `fyers_connected: bool`, `nifty: dict`, `stocks: dict[str, dict]` (keyed by short symbol; each value is a shallow copy of the state dict minus `orb` and `fy_symbol`).
  - `build_frame(prev: dict | None, curr: dict, seq: int, force_snapshot: bool = False) -> dict | None`
    - Returns a `"snapshot"` frame when `prev is None` or `force_snapshot is True`.
    - Returns a `"delta"` frame when at least one field changed.
    - Returns `None` when nothing changed.
  - `SNAPSHOT_STOCK_FIELDS: tuple[str, ...]` — the full list of stock fields sent in snapshot frames.
  - `DIFFABLE_STOCK_FIELDS: tuple[str, ...]` — subset of stock fields considered when diffing (all of `SNAPSHOT_STOCK_FIELDS` except `symbol` and `sector`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_broadcaster.py`:

```python
"""
Tests for the pure frame differ. No asyncio, no sockets — just dict math.
Run from backend/:  python -m tests.test_broadcaster
"""
from app.broadcaster import (
    DIFFABLE_STOCK_FIELDS,
    SNAPSHOT_STOCK_FIELDS,
    build_frame,
)


def _stock(symbol="RELIANCE", ltp=100.0, pct_change=0.0, day_range_pos=50.0):
    return {
        "symbol": symbol, "sector": "Energy",
        "ltp": ltp, "pct_change": pct_change,
        "relative_strength": 0.0, "day_range_pos": day_range_pos,
        "signal": "None", "signal_time": "",
        "yesterday_low": 90.0, "yesterday_high": 110.0,
        "today_low": 95.0, "today_high": 105.0,
    }


def _snapshot(stocks=None, nifty_ltp=100.0, market_open=True, fyers_connected=True):
    return {
        "market_open": market_open,
        "fyers_connected": fyers_connected,
        "nifty": {"symbol": "NIFTY50", "ltp": nifty_ltp, "prev_close": 100.0, "pct_change": 0.0},
        "stocks": {s["symbol"]: s for s in (stocks or [_stock()])},
    }


def test_first_frame_is_a_full_snapshot():
    curr = _snapshot()
    frame = build_frame(prev=None, curr=curr, seq=1)
    assert frame["type"] == "snapshot"
    assert frame["seq"] == 1
    assert frame["market_open"] is True
    assert frame["fyers_connected"] is True
    assert frame["nifty"]["ltp"] == 100.0
    assert isinstance(frame["stocks"], list) and len(frame["stocks"]) == 1
    assert set(SNAPSHOT_STOCK_FIELDS).issubset(frame["stocks"][0].keys())


def test_identical_snapshots_produce_no_frame():
    s = _snapshot()
    assert build_frame(prev=s, curr=s, seq=5) is None


def test_single_stock_changed_produces_minimal_delta():
    prev = _snapshot([_stock(ltp=100.0, pct_change=0.0)])
    curr = _snapshot([_stock(ltp=101.5, pct_change=1.5)])
    frame = build_frame(prev=prev, curr=curr, seq=2)
    assert frame["type"] == "delta"
    assert frame["seq"] == 2
    assert "nifty" not in frame        # nifty unchanged -> omitted
    assert len(frame["stocks"]) == 1
    entry = frame["stocks"][0]
    # Only 'symbol' key + the fields that changed.
    assert entry["symbol"] == "RELIANCE"
    assert entry["ltp"] == 101.5
    assert entry["pct_change"] == 1.5
    # Fields that didn't change must NOT be present:
    for field in DIFFABLE_STOCK_FIELDS:
        if field not in ("ltp", "pct_change"):
            assert field not in entry, f"{field} leaked into delta"


def test_delta_includes_nifty_only_when_it_changes():
    prev = _snapshot(nifty_ltp=100.0)
    curr = _snapshot(nifty_ltp=100.5)
    frame = build_frame(prev=prev, curr=curr, seq=3)
    assert frame["type"] == "delta"
    assert frame["nifty"]["ltp"] == 100.5
    # No stocks changed -> stocks list is empty (still a valid delta because nifty moved).
    assert frame["stocks"] == []


def test_market_open_flag_flip_is_included():
    prev = _snapshot(market_open=True)
    curr = _snapshot(market_open=False)
    frame = build_frame(prev=prev, curr=curr, seq=4)
    assert frame["type"] == "delta"
    assert frame["market_open"] is False


def test_force_snapshot_returns_snapshot_even_when_unchanged():
    s = _snapshot()
    frame = build_frame(prev=s, curr=s, seq=9, force_snapshot=True)
    assert frame is not None
    assert frame["type"] == "snapshot"
    assert frame["seq"] == 9


def test_unknown_new_symbol_appears_in_delta():
    prev = _snapshot([_stock(symbol="RELIANCE")])
    curr = _snapshot([_stock(symbol="RELIANCE"), _stock(symbol="TCS", ltp=4200.0)])
    frame = build_frame(prev=prev, curr=curr, seq=6)
    assert frame["type"] == "delta"
    syms = {e["symbol"] for e in frame["stocks"]}
    assert "TCS" in syms
    tcs = next(e for e in frame["stocks"] if e["symbol"] == "TCS")
    # New symbol: emit all snapshot fields so the client can render immediately.
    assert set(SNAPSHOT_STOCK_FIELDS).issubset(tcs.keys())


def run_all():
    tests = [v for k, v in globals().items() if k.startswith("test_") and callable(v)]
    for t in tests:
        t()
        print(f"  PASS  {t.__name__}")
    print(f"\n{len(tests)} tests passed.")


if __name__ == "__main__":
    run_all()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m tests.test_broadcaster`
Expected: `ModuleNotFoundError: No module named 'app.broadcaster'`

- [ ] **Step 3: Implement `build_frame` + helpers**

Create `backend/app/broadcaster.py`:

```python
"""
Real-time streaming layer.

  * `snapshot_from_state`  reads the shared MarketState under lock and returns
                           a plain-dict snapshot suitable for diffing/serializing.
  * `build_frame`          pure differ: given previous and current snapshots,
                           returns a snapshot frame, a delta frame, or None.

The `Broadcaster` class (see Task 2) drives these on a fixed cadence and fans
each frame out to connected WebSocket subscribers.
"""
from typing import Optional

# Every field the client needs to render a fresh row.
SNAPSHOT_STOCK_FIELDS: tuple[str, ...] = (
    "symbol", "sector",
    "ltp", "pct_change", "relative_strength", "day_range_pos",
    "signal", "signal_time",
    "yesterday_low", "yesterday_high", "today_low", "today_high",
)
# Fields whose values are compared to detect a delta (identity fields excluded).
DIFFABLE_STOCK_FIELDS: tuple[str, ...] = tuple(
    f for f in SNAPSHOT_STOCK_FIELDS if f not in ("symbol", "sector")
)


def snapshot_from_state(market_state) -> dict:
    """Serialize the shared MarketState into a plain-dict frame source."""
    with market_state.lock():
        stocks = {}
        for sym, s in market_state.stocks.items():
            stocks[sym] = {f: s[f] for f in SNAPSHOT_STOCK_FIELDS}
        nifty = dict(market_state.nifty)
        return {
            "market_open": market_state.market_open,
            "fyers_connected": False,  # patched in by main.py where auth module is imported
            "nifty": nifty,
            "stocks": stocks,
        }


def _stock_snapshot_entry(stock: dict) -> dict:
    return {f: stock[f] for f in SNAPSHOT_STOCK_FIELDS}


def _stock_delta_entry(prev: dict, curr: dict) -> Optional[dict]:
    """Return {'symbol': X, ...changed fields} or None if nothing changed."""
    changed = {f: curr[f] for f in DIFFABLE_STOCK_FIELDS if prev.get(f) != curr[f]}
    if not changed:
        return None
    return {"symbol": curr["symbol"], **changed}


def _nifty_delta(prev: dict, curr: dict) -> Optional[dict]:
    changed = {k: v for k, v in curr.items() if prev.get(k) != v}
    return changed or None


def build_frame(prev: Optional[dict], curr: dict, seq: int,
                force_snapshot: bool = False) -> Optional[dict]:
    """
    Diff two snapshots into the smallest wire frame.

    Returns:
      * a 'snapshot' frame on first-connect or force_snapshot
      * a 'delta' frame when anything changed
      * None when nothing changed (caller should send nothing this tick)
    """
    if prev is None or force_snapshot:
        return {
            "type": "snapshot",
            "seq": seq,
            "market_open": curr["market_open"],
            "fyers_connected": curr["fyers_connected"],
            "nifty": dict(curr["nifty"]),
            "stocks": [_stock_snapshot_entry(s) for s in curr["stocks"].values()],
        }

    frame: dict = {"type": "delta", "seq": seq, "stocks": []}

    if prev["market_open"] != curr["market_open"]:
        frame["market_open"] = curr["market_open"]
    if prev["fyers_connected"] != curr["fyers_connected"]:
        frame["fyers_connected"] = curr["fyers_connected"]

    nifty_diff = _nifty_delta(prev["nifty"], curr["nifty"])
    if nifty_diff is not None:
        frame["nifty"] = nifty_diff

    for sym, curr_stock in curr["stocks"].items():
        prev_stock = prev["stocks"].get(sym)
        if prev_stock is None:
            # New symbol → send the whole entry so client can render it fresh.
            frame["stocks"].append(_stock_snapshot_entry(curr_stock))
            continue
        entry = _stock_delta_entry(prev_stock, curr_stock)
        if entry is not None:
            frame["stocks"].append(entry)

    # Anything meaningful in the frame besides type/seq/stocks-empty?
    has_meta = "market_open" in frame or "fyers_connected" in frame or "nifty" in frame
    if not frame["stocks"] and not has_meta:
        return None
    return frame
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m tests.test_broadcaster`
Expected: 7 tests pass (`PASS test_first_frame_is_a_full_snapshot`, etc., then `7 tests passed.`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/broadcaster.py backend/tests/test_broadcaster.py
git commit -m "Add pure build_frame differ for streaming layer"
```

---

## Task 2: Backend — `Broadcaster` runtime + queue fan-out (TDD)

**Files:**
- Modify: `backend/app/broadcaster.py` (append the `Broadcaster` class)
- Modify: `backend/tests/test_broadcaster.py` (append asyncio tests)

**Interfaces:**
- Consumes: `build_frame`, `snapshot_from_state` from Task 1; a `snapshot_provider: Callable[[], dict]` (injected — production wires `market_state`).
- Produces:
  - `class Broadcaster`
    - `__init__(self, snapshot_provider, interval=0.25, max_queue=8)`
    - `async start(self) -> None` — spawn the tick task.
    - `async stop(self) -> None` — cancel + await the tick task.
    - `subscribe(self) -> asyncio.Queue[str]` — returns a bounded queue that will receive JSON strings; on subscribe, the queue is flagged to receive a `snapshot` on its next frame.
    - `unsubscribe(self, q: asyncio.Queue) -> None`
    - `mark_resync(self, q: asyncio.Queue) -> None` — flag `q` to receive a snapshot on its next frame.
    - Internal `_tick()` loop runs `build_frame`, serializes once, fans out; on `QueueFull` drains the queue and enqueues a fresh snapshot.

- [ ] **Step 1: Append failing tests to `backend/tests/test_broadcaster.py`**

Append at the top (imports) and bottom (new tests):

```python
# --- append to imports at top of file ---
import asyncio
import json

from app.broadcaster import Broadcaster
```

Append these test functions (before `run_all`):

```python
def _run(coro):
    return asyncio.run(coro)


def test_broadcaster_first_frame_is_snapshot():
    frames = [
        _snapshot([_stock(ltp=100.0)]),
        _snapshot([_stock(ltp=100.0)]),  # unchanged; should still get snapshot first
    ]

    async def scenario():
        it = iter(frames)
        bc = Broadcaster(snapshot_provider=lambda: next(it), interval=0.01)
        await bc.start()
        try:
            q = bc.subscribe()
            msg = await asyncio.wait_for(q.get(), timeout=1.0)
            data = json.loads(msg)
            assert data["type"] == "snapshot"
            assert data["seq"] == 1
        finally:
            await bc.stop()

    _run(scenario())


def test_broadcaster_emits_delta_on_change():
    provider_state = {"seq": 0}
    def provider():
        provider_state["seq"] += 1
        n = provider_state["seq"]
        # tick 1: baseline; tick 2+: bump ltp
        ltp = 100.0 if n == 1 else 100.0 + n
        return _snapshot([_stock(ltp=ltp, pct_change=(n - 1) * 0.1)])

    async def scenario():
        bc = Broadcaster(snapshot_provider=provider, interval=0.01)
        await bc.start()
        try:
            q = bc.subscribe()
            # First frame → snapshot
            first = json.loads(await asyncio.wait_for(q.get(), timeout=1.0))
            assert first["type"] == "snapshot"
            # Next non-None frame should be a delta with only changed fields
            second = json.loads(await asyncio.wait_for(q.get(), timeout=1.0))
            assert second["type"] == "delta"
            assert second["seq"] > first["seq"]
            assert len(second["stocks"]) == 1
            assert "ltp" in second["stocks"][0]
        finally:
            await bc.stop()

    _run(scenario())


def test_slow_subscriber_receives_snapshot_after_overflow():
    # Provider always returns a changed snapshot so every tick produces a delta.
    counter = {"n": 0}
    def provider():
        counter["n"] += 1
        return _snapshot([_stock(ltp=100.0 + counter["n"])])

    async def scenario():
        bc = Broadcaster(snapshot_provider=provider, interval=0.005, max_queue=2)
        await bc.start()
        try:
            q = bc.subscribe()
            # Don't consume for a while → queue fills → broadcaster must
            # drain+resnapshot to keep the client convergent.
            await asyncio.sleep(0.1)
            # Drain everything currently queued; the FIRST message we now read
            # must be either the initial snapshot or a post-overflow snapshot.
            saw_snapshot_after_overflow = False
            while not q.empty():
                data = json.loads(q.get_nowait())
                if data["type"] == "snapshot":
                    saw_snapshot_after_overflow = True
            assert saw_snapshot_after_overflow
        finally:
            await bc.stop()

    _run(scenario())


def test_unsubscribe_stops_delivery():
    def provider():
        return _snapshot([_stock(ltp=100.0)])

    async def scenario():
        bc = Broadcaster(snapshot_provider=provider, interval=0.005)
        await bc.start()
        try:
            q = bc.subscribe()
            await asyncio.wait_for(q.get(), timeout=1.0)  # snapshot
            bc.unsubscribe(q)
            # Drain any in-flight message, then confirm no new ones for a bit.
            while not q.empty():
                q.get_nowait()
            await asyncio.sleep(0.05)
            assert q.empty()
        finally:
            await bc.stop()

    _run(scenario())
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m tests.test_broadcaster`
Expected: `ImportError: cannot import name 'Broadcaster' from 'app.broadcaster'`

- [ ] **Step 3: Implement `Broadcaster`**

Append to `backend/app/broadcaster.py`:

```python
import asyncio
import json
from typing import Callable


class Broadcaster:
    """
    Ticks on a fixed interval, builds one frame per tick, and fans that
    single serialized string out to every subscribed WebSocket via bounded
    asyncio.Queues. Slow subscribers are silently resynced (drain + snapshot).
    """

    def __init__(self, snapshot_provider: Callable[[], dict],
                 interval: float = 0.25, max_queue: int = 8):
        self._provider = snapshot_provider
        self._interval = interval
        self._max_queue = max_queue
        self._task: asyncio.Task | None = None
        self._prev: dict | None = None
        self._seq: int = 0
        # Each subscriber = (queue, needs_snapshot_flag)
        self._subs: dict[asyncio.Queue, bool] = {}

    # ---- lifecycle ----
    async def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._run(), name="broadcaster")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except (asyncio.CancelledError, Exception):
            pass
        self._task = None

    # ---- subscription ----
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=self._max_queue)
        self._subs[q] = True  # needs snapshot on next frame
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subs.pop(q, None)

    def mark_resync(self, q: asyncio.Queue) -> None:
        if q in self._subs:
            self._subs[q] = True

    # ---- tick loop ----
    async def _run(self) -> None:
        try:
            while True:
                await self._tick_once()
                await asyncio.sleep(self._interval)
        except asyncio.CancelledError:
            return

    async def _tick_once(self) -> None:
        curr = self._provider()
        # Advance seq only when we actually emit; keep it monotonic per emission.
        # But the frame needs the seq BEFORE we know if we'll emit — so peek.
        next_seq = self._seq + 1
        frame = build_frame(self._prev, curr, seq=next_seq)
        needs_resync = [q for q, flag in self._subs.items() if flag]

        # Nothing changed AND no one needs a forced snapshot → do nothing.
        if frame is None and not needs_resync:
            return

        # Build the two possible payloads: regular delta/snapshot and forced snapshot.
        payload: str | None = None
        snapshot_payload: str | None = None
        if frame is not None:
            self._seq = next_seq
            self._prev = curr
            payload = json.dumps(frame, separators=(",", ":"))
        if needs_resync:
            # Forced snapshot always uses the current seq (either the one we
            # just bumped for the delta above, or a fresh one if there was no delta).
            snap_seq = self._seq if frame is not None else next_seq
            if frame is None:
                self._seq = snap_seq
                self._prev = curr
            snap_frame = build_frame(None, curr, seq=snap_seq, force_snapshot=True)
            snapshot_payload = json.dumps(snap_frame, separators=(",", ":"))

        for q, flag in list(self._subs.items()):
            msg = snapshot_payload if flag else payload
            if msg is None:
                continue
            try:
                q.put_nowait(msg)
                if flag:
                    self._subs[q] = False
            except asyncio.QueueFull:
                # Slow client → drop everything in the queue and give it a
                # snapshot so it re-converges silently.
                while not q.empty():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                fresh = snapshot_payload or json.dumps(
                    build_frame(None, curr, seq=self._seq, force_snapshot=True),
                    separators=(",", ":"),
                )
                try:
                    q.put_nowait(fresh)
                    self._subs[q] = False
                except asyncio.QueueFull:
                    # Should be impossible right after drain; if it happens
                    # the subscriber's consumer is truly dead — leave it.
                    pass
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m tests.test_broadcaster`
Expected: all 11 tests pass (7 from Task 1 + 4 new async tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/broadcaster.py backend/tests/test_broadcaster.py
git commit -m "Add Broadcaster runtime with bounded-queue fan-out"
```

---

## Task 3: Backend — wire `/ws/stream` + remove SSE + config change

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: `Broadcaster`, `snapshot_from_state`, `build_frame` from Task 2.
- Produces:
  - `GET /ws/stream` (WebSocket) — auth-gated stream of `snapshot`/`delta` JSON strings.
  - `GET /api/snapshot` — now returns a single snapshot frame (same shape as WS `snapshot` frames) so the client can share the parser.
  - `GET /api/stream` (SSE) — **removed**.

- [ ] **Step 1: Update `backend/app/config.py`**

Change the `STREAM_INTERVAL` line and add a new `BROADCAST_MAX_QUEUE` line. Locate:

```python
STREAM_INTERVAL = float(os.getenv("STREAM_INTERVAL", "1.0"))
```

Replace with:

```python
STREAM_INTERVAL = float(os.getenv("STREAM_INTERVAL", "0.25"))
BROADCAST_MAX_QUEUE = int(os.getenv("BROADCAST_MAX_QUEUE", "8"))
```

- [ ] **Step 2: Edit `backend/app/main.py` — imports and lifespan**

Replace the imports block at the top of the file:

```python
"""
FastAPI Backend-For-Frontend.

Ingests millisecond ticks in-memory (via DataEngine), then a single Broadcaster
task fans a diffed JSON frame out to all WebSocket subscribers every
`STREAM_INTERVAL` seconds. No broker credentials or raw broker sockets are
ever exposed to the client. A built-in login (session cookie) gates the
dashboard; FYERS account auth is handled separately via /callback + /api/auth/*.
"""
import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, security
from .broadcaster import Broadcaster, build_frame, snapshot_from_state
from .fyers_service import data_engine
from .scheduler import ensure_engine_running, init_scheduler, is_market_open, shutdown_scheduler
from .state import market_state


def _live_snapshot() -> dict:
    """Snapshot provider for the Broadcaster: reads state + patches fyers flag."""
    snap = snapshot_from_state(market_state)
    snap["fyers_connected"] = auth.auth_status()["authenticated"]
    return snap


broadcaster = Broadcaster(
    snapshot_provider=_live_snapshot,
    interval=config.STREAM_INTERVAL,
    max_queue=config.BROADCAST_MAX_QUEUE,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(init_scheduler)
    await broadcaster.start()
    try:
        yield
    finally:
        await broadcaster.stop()
        shutdown_scheduler()


app = FastAPI(title="Live Stock Scanning BFF", lifespan=lifespan)
```

- [ ] **Step 3: Delete the old `build_payload` and the `/api/stream` route**

In `backend/app/main.py`, delete the entire `def build_payload() -> dict:` function (and its `range_map` import at the top of the file if present). Also delete the `@app.get("/api/stream", ...)` route and its `event_generator` helper. Also remove the `StreamingResponse` import if it becomes unused.

- [ ] **Step 4: Replace `/api/snapshot` with a snapshot-frame emitter**

Replace the existing `/api/snapshot` handler with:

```python
@app.get("/api/snapshot", dependencies=[Depends(require_login)])
async def snapshot():
    """One-shot current state, in the same frame shape as a WS 'snapshot' message.
    Used by the SPA to warm its store when it can't open a WebSocket yet."""
    curr = _live_snapshot()
    return build_frame(prev=None, curr=curr, seq=0)
```

- [ ] **Step 5: Add the `/ws/stream` WebSocket endpoint**

Add (place near the other data routes):

```python
@app.websocket("/ws/stream")
async def ws_stream(websocket: WebSocket):
    # Auth: session cookie is exposed on websocket.session by SessionMiddleware.
    if not security.is_authenticated(websocket):
        await websocket.close(code=4401)
        return

    await websocket.accept()
    q = broadcaster.subscribe()
    receiver_task = asyncio.create_task(_ws_reader(websocket, q))
    try:
        while True:
            msg = await q.get()
            await websocket.send_text(msg)
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        # Any send error → connection dead; fall through to cleanup.
        pass
    finally:
        receiver_task.cancel()
        broadcaster.unsubscribe(q)


async def _ws_reader(websocket: WebSocket, q):
    """Handle inbound client control messages (only 'resync' for now)."""
    try:
        while True:
            msg = await websocket.receive_json()
            if isinstance(msg, dict) and msg.get("type") == "resync":
                broadcaster.mark_resync(q)
    except (WebSocketDisconnect, Exception):
        return
```

- [ ] **Step 6: Verify existing calculations tests still pass**

Run: `cd backend && python -m tests.test_calculations`
Expected: `5 tests passed.` (No changes to `calculations.py`.)

- [ ] **Step 7: Verify broadcaster tests still pass**

Run: `cd backend && python -m tests.test_broadcaster`
Expected: `11 tests passed.`

- [ ] **Step 8: Smoke-test that FastAPI imports cleanly**

Run: `cd backend && python -c "from app.main import app; print('ok', len(app.routes), 'routes')"`
Expected: `ok N routes` (no ImportError). The `/api/stream` SSE route should be gone; `/ws/stream` should be present.

- [ ] **Step 9: Commit**

```bash
git add backend/app/config.py backend/app/main.py
git commit -m "Replace /api/stream SSE with /ws/stream WebSocket + broadcaster"
```

---

## Task 4: Frontend — add Vitest + client-side `rangeMap`

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/lib/rangeMap.js`
- Create: `frontend/src/lib/rangeMap.test.js`

**Interfaces:**
- Produces:
  - `rangeMap(y_low, y_high, t_low, t_high, ltp) -> { yesterday: {low, high, raw_low, raw_high}, today: {low, high, raw_low, raw_high}, ltp_pos }` — pure JS mirror of Python `range_map` in `backend/app/calculations.py:36`.

- [ ] **Step 1: Add Vitest devDependencies + test script**

Edit `frontend/package.json`. Change the `scripts` and `devDependencies` blocks to:

```json
{
  "name": "tradedashboard-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.4",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.1",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "vite": "^6.0.7",
    "vitest": "^2.1.9"
  }
}
```

- [ ] **Step 2: Add Vitest config**

Create `frontend/vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    globals: false,
  },
});
```

- [ ] **Step 3: Install dependencies**

Run: `cd frontend && npm install`
Expected: `vitest` and `jsdom` added; no errors.

- [ ] **Step 4: Write the failing test**

Create `frontend/src/lib/rangeMap.test.js`:

```js
import { describe, it, expect } from "vitest";
import { rangeMap } from "./rangeMap.js";

// Values mirror backend/tests/test_calculations.py::test_range_map so
// the JS and Python implementations must agree.
describe("rangeMap", () => {
  it("maps yesterday's low to 0 when it is the global min", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.yesterday.low).toBeCloseTo(0.0);
  });

  it("maps today's high to 100 when it is the global max", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.today.high).toBeCloseTo(100.0);
  });

  it("keeps ltp_pos within [0, 100]", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.ltp_pos).toBeGreaterThanOrEqual(0);
    expect(r.ltp_pos).toBeLessThanOrEqual(100);
  });

  it("carries raw prices through unchanged", () => {
    const r = rangeMap(3580, 3690, 3600, 3700, 3690);
    expect(r.yesterday.raw_high).toBe(3690);
    expect(r.today.raw_low).toBe(3600);
  });

  it("handles zero-span (all values equal) without dividing by zero", () => {
    const r = rangeMap(100, 100, 100, 100, 100);
    expect(Number.isFinite(r.ltp_pos)).toBe(true);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: `Cannot find module './rangeMap.js'` (or similar resolve failure).

- [ ] **Step 6: Implement `rangeMap`**

Create `frontend/src/lib/rangeMap.js`:

```js
// Pure JS mirror of backend/app/calculations.py::range_map.
// Kept in sync with the Python version by shared unit tests
// (backend/tests/test_calculations.py + src/lib/rangeMap.test.js).

const round2 = (n) => Math.round(n * 100) / 100;

function normalize(price, gMin, gMax) {
  const denom = (gMax - gMin) || 1.0;
  return round2(((price - gMin) / denom) * 100);
}

export function rangeMap(yLow, yHigh, tLow, tHigh, ltp) {
  const gMin = Math.min(yLow, tLow);
  const gMax = Math.max(yHigh, tHigh);
  return {
    yesterday: {
      low: normalize(yLow, gMin, gMax),
      high: normalize(yHigh, gMin, gMax),
      raw_low: yLow,
      raw_high: yHigh,
    },
    today: {
      low: normalize(tLow, gMin, gMax),
      high: normalize(tHigh, gMin, gMax),
      raw_low: tLow,
      raw_high: tHigh,
    },
    ltp_pos: normalize(ltp, gMin, gMax),
  };
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: 5 tests pass in `rangeMap.test.js`.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/lib/rangeMap.js frontend/src/lib/rangeMap.test.js
git commit -m "Add Vitest and client-side rangeMap helper"
```

---

## Task 5: Frontend — per-symbol market store (TDD)

**Files:**
- Create: `frontend/src/store/marketStore.js`
- Create: `frontend/src/store/marketStore.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (a single object exported as `marketStore`):
  - `applyFrame(frame: {type: 'snapshot'|'delta', ...})` — routes to snapshot or delta apply.
  - `getStock(symbol: string) -> stock | undefined`
  - `subscribeStock(symbol: string, cb: () => void) -> () => void` (returns unsubscribe)
  - `getSymbols() -> string[]` (stable-sorted A→Z; identity is only changed when membership changes)
  - `subscribeSymbols(cb) -> () => void`
  - `getMeta() -> { marketOpen: boolean, fyersConnected: boolean, connected: boolean, nifty: object, lastSeq: number }`
  - `subscribeMeta(cb) -> () => void`
  - `setConnected(flag: boolean)` — used by the WS hook to reflect connection status without a frame.
  - `reset()` — clears everything (used by tests / on hard reconnect).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/store/marketStore.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { marketStore } from "./marketStore.js";

const snapshotFrame = {
  type: "snapshot",
  seq: 1,
  market_open: true,
  fyers_connected: true,
  nifty: { symbol: "NIFTY50", ltp: 100, prev_close: 100, pct_change: 0 },
  stocks: [
    { symbol: "RELIANCE", sector: "Energy",
      ltp: 100, pct_change: 0, relative_strength: 0, day_range_pos: 50,
      signal: "None", signal_time: "",
      yesterday_low: 90, yesterday_high: 110, today_low: 95, today_high: 105 },
    { symbol: "TCS", sector: "IT",
      ltp: 4000, pct_change: 0, relative_strength: 0, day_range_pos: 25,
      signal: "None", signal_time: "",
      yesterday_low: 3900, yesterday_high: 4050, today_low: 3950, today_high: 4020 },
  ],
};

beforeEach(() => marketStore.reset());

describe("marketStore.applyFrame", () => {
  it("loads a snapshot into the store", () => {
    marketStore.applyFrame(snapshotFrame);
    expect(marketStore.getStock("RELIANCE").ltp).toBe(100);
    expect(marketStore.getSymbols()).toEqual(["RELIANCE", "TCS"]);
    expect(marketStore.getMeta().lastSeq).toBe(1);
    expect(marketStore.getMeta().marketOpen).toBe(true);
  });

  it("merges a delta into an existing stock", () => {
    marketStore.applyFrame(snapshotFrame);
    marketStore.applyFrame({
      type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101.5, pct_change: 1.5 }],
    });
    const r = marketStore.getStock("RELIANCE");
    expect(r.ltp).toBe(101.5);
    expect(r.pct_change).toBe(1.5);
    expect(r.sector).toBe("Energy"); // untouched fields preserved
    expect(marketStore.getMeta().lastSeq).toBe(2);
  });

  it("snapshot + N deltas equals equivalent single snapshot", () => {
    marketStore.applyFrame(snapshotFrame);
    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101.0 }] });
    marketStore.applyFrame({ type: "delta", seq: 3,
      stocks: [{ symbol: "TCS", ltp: 4020.0 }] });

    marketStore.reset();
    marketStore.applyFrame({
      ...snapshotFrame,
      seq: 99,
      stocks: [
        { ...snapshotFrame.stocks[0], ltp: 101.0 },
        { ...snapshotFrame.stocks[1], ltp: 4020.0 },
      ],
    });

    expect(marketStore.getStock("RELIANCE").ltp).toBe(101.0);
    expect(marketStore.getStock("TCS").ltp).toBe(4020.0);
  });

  it("subscribeStock fires only when that symbol's fields change", () => {
    marketStore.applyFrame(snapshotFrame);
    const reliance = vi.fn();
    const tcs = vi.fn();
    marketStore.subscribeStock("RELIANCE", reliance);
    marketStore.subscribeStock("TCS", tcs);

    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 101 }] });

    expect(reliance).toHaveBeenCalledTimes(1);
    expect(tcs).not.toHaveBeenCalled();
  });

  it("subscribeSymbols only fires when the symbol set changes", () => {
    marketStore.applyFrame(snapshotFrame);
    const cb = vi.fn();
    marketStore.subscribeSymbols(cb);

    // Same set of symbols → no notification.
    marketStore.applyFrame({ type: "delta", seq: 2,
      stocks: [{ symbol: "RELIANCE", ltp: 105 }] });
    expect(cb).not.toHaveBeenCalled();

    // New symbol appears → notify.
    marketStore.applyFrame({ type: "delta", seq: 3, stocks: [
      { symbol: "INFY", sector: "IT",
        ltp: 1500, pct_change: 0, relative_strength: 0, day_range_pos: 50,
        signal: "None", signal_time: "",
        yesterday_low: 1490, yesterday_high: 1520, today_low: 1495, today_high: 1510 },
    ] });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(marketStore.getSymbols()).toEqual(["INFY", "RELIANCE", "TCS"]);
  });

  it("setConnected notifies meta subscribers without touching stocks", () => {
    marketStore.applyFrame(snapshotFrame);
    const meta = vi.fn();
    const stock = vi.fn();
    marketStore.subscribeMeta(meta);
    marketStore.subscribeStock("RELIANCE", stock);
    marketStore.setConnected(false);
    expect(meta).toHaveBeenCalledTimes(1);
    expect(stock).not.toHaveBeenCalled();
    expect(marketStore.getMeta().connected).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: `Cannot find module './marketStore.js'`.

- [ ] **Step 3: Implement `marketStore`**

Create `frontend/src/store/marketStore.js`:

```js
// Per-symbol reactive store backed by a Map. Fine-grained subscriptions
// let a WatchlistRow re-render only when its own stock changes.

function createStore() {
  let stocks = new Map();                 // symbol -> stock object
  let symbols = [];                        // stable-sorted symbol list
  let meta = {
    marketOpen: false,
    fyersConnected: false,
    connected: false,
    nifty: {},
    lastSeq: 0,
  };

  const stockSubs = new Map();             // symbol -> Set<cb>
  const symbolSubs = new Set();            // Set<cb>
  const metaSubs = new Set();              // Set<cb>

  function notifyStock(sym) {
    const subs = stockSubs.get(sym);
    if (subs) subs.forEach((cb) => cb());
  }
  function notifySymbols() { symbolSubs.forEach((cb) => cb()); }
  function notifyMeta() { metaSubs.forEach((cb) => cb()); }

  function recomputeSymbolList() {
    const next = Array.from(stocks.keys()).sort();
    if (next.length !== symbols.length ||
        next.some((s, i) => s !== symbols[i])) {
      symbols = next;
      notifySymbols();
    }
  }

  function applySnapshot(frame) {
    stocks = new Map();
    for (const s of frame.stocks || []) stocks.set(s.symbol, { ...s });
    meta = {
      ...meta,
      marketOpen: !!frame.market_open,
      fyersConnected: !!frame.fyers_connected,
      nifty: { ...(frame.nifty || {}) },
      lastSeq: frame.seq ?? meta.lastSeq,
    };
    recomputeSymbolList();
    // After a snapshot every row should re-render.
    stockSubs.forEach((_subs, sym) => notifyStock(sym));
    notifyMeta();
  }

  function applyDelta(frame) {
    let metaChanged = false;
    if ("market_open" in frame) {
      meta = { ...meta, marketOpen: !!frame.market_open };
      metaChanged = true;
    }
    if ("fyers_connected" in frame) {
      meta = { ...meta, fyersConnected: !!frame.fyers_connected };
      metaChanged = true;
    }
    if (frame.nifty) {
      meta = { ...meta, nifty: { ...meta.nifty, ...frame.nifty } };
      metaChanged = true;
    }
    if (frame.seq != null && frame.seq !== meta.lastSeq) {
      meta = { ...meta, lastSeq: frame.seq };
      metaChanged = true;
    }

    let membershipChanged = false;
    for (const entry of frame.stocks || []) {
      const sym = entry.symbol;
      const existing = stocks.get(sym);
      if (existing) {
        stocks.set(sym, { ...existing, ...entry });
        notifyStock(sym);
      } else {
        stocks.set(sym, { ...entry });
        membershipChanged = true;
        notifyStock(sym);
      }
    }
    if (membershipChanged) recomputeSymbolList();
    if (metaChanged) notifyMeta();
  }

  return {
    applyFrame(frame) {
      if (!frame || !frame.type) return;
      if (frame.type === "snapshot") applySnapshot(frame);
      else if (frame.type === "delta") applyDelta(frame);
    },
    getStock(sym) { return stocks.get(sym); },
    getSymbols() { return symbols; },
    getMeta() { return meta; },

    subscribeStock(sym, cb) {
      let subs = stockSubs.get(sym);
      if (!subs) { subs = new Set(); stockSubs.set(sym, subs); }
      subs.add(cb);
      return () => {
        subs.delete(cb);
        if (subs.size === 0) stockSubs.delete(sym);
      };
    },
    subscribeSymbols(cb) {
      symbolSubs.add(cb);
      return () => symbolSubs.delete(cb);
    },
    subscribeMeta(cb) {
      metaSubs.add(cb);
      return () => metaSubs.delete(cb);
    },

    setConnected(flag) {
      if (meta.connected === flag) return;
      meta = { ...meta, connected: flag };
      notifyMeta();
    },

    reset() {
      stocks = new Map();
      symbols = [];
      meta = { marketOpen: false, fyersConnected: false, connected: false,
               nifty: {}, lastSeq: 0 };
      stockSubs.clear();
      symbolSubs.clear();
      metaSubs.clear();
    },
  };
}

export const marketStore = createStore();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: all 6 marketStore tests pass, plus the 5 rangeMap tests from Task 4.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/marketStore.js frontend/src/store/marketStore.test.js
git commit -m "Add per-symbol reactive marketStore"
```

---

## Task 6: Frontend — WebSocket client + React hooks

**Files:**
- Modify: `frontend/src/hooks/useMarketStream.js` (full rewrite)

**Interfaces:**
- Consumes: `marketStore` from Task 5.
- Produces (all named exports):
  - `useMarketStream()` — starts the WebSocket on mount, tears down on unmount. Returns `{ connected }` (compatibility shim; existing App also switches to `useMarketMeta`).
  - `useStock(symbol) -> stock | undefined`
  - `useSymbols() -> string[]`
  - `useMarketMeta() -> { marketOpen, fyersConnected, connected, nifty, lastSeq }`

Store cache key is preserved so pre-existing localStorage snapshots continue to warm the store on cold start.

- [ ] **Step 1: Replace the file contents**

Overwrite `frontend/src/hooks/useMarketStream.js` with:

```js
import { useEffect, useSyncExternalStore } from "react";
import { marketStore } from "../store/marketStore.js";

const CACHE_KEY = "dashboard_offline_cache";

// ---- Module-level singleton WebSocket controller ----
// Kept outside React so remounts don't tear the socket down.
let ws = null;
let refCount = 0;
let backoffMs = 500;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastFrameAt = 0;

function scheduleReconnect() {
  if (reconnectTimer) return;
  const delay = backoffMs;
  backoffMs = Math.min(backoffMs * 2, 10_000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

function armHeartbeat() {
  clearInterval(heartbeatTimer);
  lastFrameAt = Date.now();
  heartbeatTimer = setInterval(() => {
    if (Date.now() - lastFrameAt > 30_000 && ws) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }, 5_000);
}

function warmFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return;
    const frame = JSON.parse(cached);
    if (frame && frame.type === "snapshot") marketStore.applyFrame(frame);
  } catch { /* ignore */ }
}

function persistSnapshot(frame) {
  try {
    if (frame?.type === "snapshot") {
      localStorage.setItem(CACHE_KEY, JSON.stringify(frame));
    }
  } catch { /* ignore */ }
}

function wsUrl() {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws/stream`;
}

function connect() {
  if (ws) return;
  const socket = new WebSocket(wsUrl());
  ws = socket;

  socket.onopen = () => {
    backoffMs = 500;
    marketStore.setConnected(true);
    armHeartbeat();
  };

  socket.onmessage = (ev) => {
    lastFrameAt = Date.now();
    try {
      const frame = JSON.parse(ev.data);
      // Detect sequence gap on delta frames → ask server for a fresh snapshot.
      if (frame?.type === "delta") {
        const lastSeq = marketStore.getMeta().lastSeq;
        if (lastSeq > 0 && frame.seq !== lastSeq + 1) {
          try { socket.send(JSON.stringify({ type: "resync" })); } catch { /* ignore */ }
          // Still merge what we got; the incoming snapshot will overwrite.
        }
      }
      marketStore.applyFrame(frame);
      persistSnapshot(frame);
    } catch (err) {
      console.error("WS decode error:", err);
    }
  };

  socket.onerror = () => {
    // onclose will follow; nothing to do here.
  };

  socket.onclose = () => {
    ws = null;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    marketStore.setConnected(false);
    if (refCount > 0) scheduleReconnect();
  };
}

function acquire() {
  refCount += 1;
  warmFromCache();
  connect();
}

function release() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    if (ws) {
      try { ws.close(); } catch { /* ignore */ }
      ws = null;
    }
  }
}

// ---- React hooks ----
export function useMarketStream() {
  useEffect(() => {
    acquire();
    return () => release();
  }, []);
  const meta = useMarketMeta();
  return { connected: meta.connected };
}

export function useStock(symbol) {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeStock(symbol, cb),
    () => marketStore.getStock(symbol),
    () => marketStore.getStock(symbol),
  );
}

export function useSymbols() {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeSymbols(cb),
    () => marketStore.getSymbols(),
    () => marketStore.getSymbols(),
  );
}

export function useMarketMeta() {
  return useSyncExternalStore(
    (cb) => marketStore.subscribeMeta(cb),
    () => marketStore.getMeta(),
    () => marketStore.getMeta(),
  );
}
```

- [ ] **Step 2: Manually smoke-test with the backend**

In one shell: `cd backend && python run.py`
In another: `cd frontend && npm run dev`
Open `http://localhost:5173` in a browser, log in.

Expected in DevTools → Network → WS tab:
- One connection to `ws://localhost:5173/ws/stream` (proxied to backend `:8000`).
- If the WS proxy doesn't work through Vite by default, add proxy config in Step 3 below.

- [ ] **Step 3: If needed, enable WebSocket proxying in Vite**

Vite proxies HTTP `/api/*` today but WebSocket URLs need `ws: true`. Edit `frontend/vite.config.js`:

Replace the `proxy` block with:

```js
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
        changeOrigin: true,
      },
    },
```

Re-verify the WS connection in the browser DevTools.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useMarketStream.js frontend/vite.config.js
git commit -m "Rewrite useMarketStream as WebSocket client with per-symbol hooks"
```

---

## Task 7: Frontend — refactor `App.jsx` and `WatchlistRow.jsx` for fine-grained renders

**Files:**
- Modify: `frontend/src/components/WatchlistRow.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `useStock`, `useSymbols`, `useMarketMeta`, `useMarketStream` from Task 6; `rangeMap` from Task 4.
- Produces: no exported changes beyond internal refactor.

- [ ] **Step 1: Rewrite `WatchlistRow.jsx` to subscribe to its own symbol**

Overwrite `frontend/src/components/WatchlistRow.jsx`:

```jsx
import React, { useMemo } from "react";
import OverlappingRangeBar from "./OverlappingRangeBar.jsx";
import { useStock } from "../hooks/useMarketStream.js";
import { rangeMap } from "../lib/rangeMap.js";

function WatchlistRow({ symbol }) {
  const stock = useStock(symbol);
  const ranges = useMemo(() => {
    if (!stock) return null;
    return rangeMap(
      stock.yesterday_low || 0, stock.yesterday_high || 0,
      stock.today_low || 0, stock.today_high || 0,
      stock.ltp || 0,
    );
  }, [
    stock?.yesterday_low, stock?.yesterday_high,
    stock?.today_low, stock?.today_high, stock?.ltp,
  ]);

  if (!stock) return null;

  const isPositive = stock.pct_change >= 0;
  const isRsPositive = stock.relative_strength >= 0;
  const hasSignal = stock.signal && stock.signal !== "None";
  const isBull = hasSignal && stock.signal.includes("Bull");

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-900 transition-colors">
      <td className="py-3 px-4">
        <div className="font-bold text-white tracking-wide">{stock.symbol}</div>
        <div className="text-xs text-zinc-500 font-semibold">{stock.sector}</div>
      </td>

      <td className="py-3 px-4 font-mono text-right">
        <span className={isPositive ? "text-green-400 font-semibold" : "text-red-400 font-semibold"}>
          {Number(stock.ltp).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </span>
        <div className={`text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}>
          {isPositive ? "+" : ""}{stock.pct_change}%
        </div>
      </td>

      <td className="py-3 px-4 text-center">
        <div className="flex flex-col items-center">
          <div className="flex justify-between w-[160px] text-[10px] text-zinc-500 font-mono mb-1">
            <span>{ranges?.yesterday?.raw_low}</span>
            <span>{ranges?.yesterday?.raw_high}</span>
          </div>
          {ranges && <OverlappingRangeBar ranges={ranges} />}
          <div className="text-[10px] text-zinc-600 font-mono mt-1">
            {stock.day_range_pos}% of day range
          </div>
        </div>
      </td>

      <td className="py-3 px-4 text-center">
        {hasSignal ? (
          <div className={`inline-flex flex-col items-center px-3 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${
            isBull
              ? "bg-green-950/50 text-green-400 border border-green-800/30"
              : "bg-red-950/50 text-red-400 border border-red-800/30"
          }`}>
            <span>{isBull ? "▲ " : "▼ "}{stock.signal}</span>
            <span className="text-[10px] font-semibold text-zinc-400 mt-0.5">{stock.signal_time}</span>
          </div>
        ) : (
          <span className="text-zinc-600 font-semibold text-xs">—</span>
        )}
      </td>

      <td className="py-3 px-4 font-mono text-right">
        <span className={`font-bold ${isRsPositive ? "text-green-400" : "text-red-400"}`}>
          {isRsPositive ? "+" : ""}{stock.relative_strength}
        </span>
        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5">
          {isRsPositive ? "Outperform" : "Underperform"}
        </div>
      </td>
    </tr>
  );
}

export default WatchlistRow;
```

- [ ] **Step 2: Refactor `App.jsx` Dashboard to use hooks + minimal projections**

In `frontend/src/App.jsx`, replace the entire `function Dashboard({ user, onLogout }) { ... }` block (from that opening line through its matching closing `}`) with:

```jsx
function Dashboard({ user, onLogout }) {
  useMarketStream();                    // starts/stops the singleton WS
  const meta = useMarketMeta();
  const symbols = useSymbols();

  const [selectedSignal, setSelectedSignal] = useState("All signals");
  const [selectedSector, setSelectedSector] = useState("All sectors");
  const [dayRangeThreshold, setDayRangeThreshold] = useState(0);
  const [sortKey, setSortKey] = useState("rs_desc");

  // Filter+sort re-runs when: symbol set changes, meta.lastSeq ticks (any data
  // change), or a UI control changes. We snapshot the store synchronously here.
  const { sectors, visibleSymbols } = useMemo(() => {
    const rows = symbols
      .map((s) => marketStore.getStock(s))
      .filter(Boolean);

    const sectorSet = new Set(rows.map((r) => r.sector));

    const filtered = rows.filter((stock) => {
      if (selectedSignal !== "All signals") {
        if (!stock.signal || !stock.signal.includes(selectedSignal)) return false;
      }
      if (selectedSector !== "All sectors" && stock.sector !== selectedSector) return false;
      if (stock.day_range_pos < dayRangeThreshold) return false;
      return true;
    });

    filtered.sort(SORTS[sortKey].fn);
    return {
      sectors: ["All sectors", ...Array.from(sectorSet).sort()],
      visibleSymbols: filtered.map((r) => r.symbol),
    };
  }, [symbols, meta.lastSeq, selectedSignal, selectedSector, dayRangeThreshold, sortKey]);

  const marketOpen = meta.marketOpen;
  const fyersConnected = meta.fyersConnected;
  const nifty = meta.nifty || {};
  const connected = meta.connected;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto bg-zinc-900 border border-zinc-800 rounded-lg p-6 shadow-2xl">
        {fyersConnected === false && <ConnectFyersBanner />}

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Control label="Breakout Signal">
            <select
              value={selectedSignal}
              onChange={(e) => setSelectedSignal(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              <option>All signals</option>
              <option value="Bull">Bull</option>
              <option value="Bear">Bear</option>
            </select>
          </Control>

          <Control label="Sector">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              {sectors.map((s) => (<option key={s}>{s}</option>))}
            </select>
          </Control>

          <Control label="Sort by">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value)}
              className="w-full bg-zinc-850 border border-zinc-700 rounded p-2 text-sm text-white focus:outline-none"
            >
              {Object.entries(SORTS).map(([key, { label }]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </Control>

          <div>
            <div className="flex justify-between">
              <label className="block text-xs font-bold text-zinc-400 uppercase mb-2">
                Day Range Position ≥
              </label>
              <span className="text-xs font-bold text-blue-400">{dayRangeThreshold}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={dayRangeThreshold}
              onChange={(e) => setDayRangeThreshold(Number(e.target.value))}
              className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500 mt-3"
            />
          </div>
        </div>

        {/* Status / benchmark */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-6">
          <div className="flex items-center space-x-3">
            <span className={`w-2.5 h-2.5 rounded-full ${
              connected && marketOpen ? "bg-green-500 animate-pulse" : "bg-zinc-500"
            }`} />
            <h1 className="text-lg font-bold tracking-tight text-white">Live Price Action Dashboard</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
              marketOpen ? "bg-green-950 text-green-400" : "bg-zinc-800 text-zinc-400"
            }`}>
              {marketOpen ? "Live" : connected ? "Closed" : "Offline"}
            </span>
            <span className="text-xs text-zinc-500 font-mono">({visibleSymbols.length} stocks)</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-xs text-zinc-500 font-bold uppercase tracking-wider mb-0.5">
                Benchmark: NIFTY 50
              </div>
              <div className="font-mono text-sm">
                <span className="text-white font-bold">
                  {nifty.ltp?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                </span>
                <span className={nifty.pct_change >= 0 ? "text-green-400" : "text-red-400"}>
                  {nifty.pct_change >= 0 ? "+" : ""}{nifty.pct_change}%
                </span>
              </div>
            </div>
            <div className="text-right border-l border-zinc-800 pl-5">
              <div className="text-xs text-zinc-500">{user}</div>
              <button onClick={onLogout} className="text-xs font-bold text-zinc-400 hover:text-white transition-colors">
                Log out
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-850/50 border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                <th className="py-3 px-4">Stock</th>
                <th className="py-3 px-4 text-right">LTP</th>
                <th className="py-3 px-4 text-center">Price Range (Today vs Prev Day)</th>
                <th className="py-3 px-4 text-center">Signal</th>
                <th className="py-3 px-4 text-right">RS vs Nifty</th>
              </tr>
            </thead>
            <tbody>
              {visibleSymbols.map((sym) => (
                <WatchlistRow key={sym} symbol={sym} />
              ))}
            </tbody>
          </table>
          {visibleSymbols.length === 0 && (
            <div className="py-10 text-center text-zinc-600 text-sm">
              No stocks match the current filters.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Fix the imports at the top of `App.jsx`**

At the top of `frontend/src/App.jsx`, replace the imports block with:

```jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  useMarketStream,
  useMarketMeta,
  useSymbols,
} from "./hooks/useMarketStream.js";
import { marketStore } from "./store/marketStore.js";
import WatchlistRow from "./components/WatchlistRow.jsx";
```

- [ ] **Step 4: Verify the build passes**

Run: `cd frontend && npm run build`
Expected: `vite build` finishes without errors, writes `dist/`.

- [ ] **Step 5: Verify unit tests still pass**

Run: `cd frontend && npm test`
Expected: all tests from Tasks 4 and 5 still green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/WatchlistRow.jsx frontend/src/App.jsx
git commit -m "Fine-grained per-row subscriptions via useStock/useSymbols"
```

---

## Task 8: End-to-end verification & tidy

**Files:** none modified; this task is a checklist that gates "done."

- [ ] **Step 1: Start backend and frontend**

Shell A: `cd backend && python run.py`
Shell B: `cd frontend && npm run dev`

Log in in the browser. If FYERS isn't connected, do so (or set `FORCE_MARKET_OPEN=true` in `.env` for a dev feed).

- [ ] **Step 2: Verify the WebSocket connection**

Open DevTools → Network → WS. Filter for `ws/stream`.
Expected:
- Status `101 Switching Protocols`.
- First message payload starts with `{"type":"snapshot"`.
- Subsequent messages start with `{"type":"delta"` and arrive roughly every 250 ms during market hours (or whenever ticks are flowing).
- Typical delta payload size < 2 KB (visible in the frames list).

- [ ] **Step 3: Verify per-row rendering**

Install React DevTools if not present. Open the Profiler tab, click "Record", let the dashboard run for ~5 seconds during ticks, stop recording.
Expected: only rows whose LTP/pct-change actually changed appear in the commit list. Rows that didn't move should not render.

- [ ] **Step 4: Verify multi-client O(1) property**

Open 5 browser tabs on the dashboard. In Shell A, watch the process. Backend CPU should be roughly the same as with 1 tab (compute-once fan-out). This is a qualitative check — a large spike per new tab indicates the shared broadcaster isn't wired correctly.

- [ ] **Step 5: Verify reconnect**

In Shell A, Ctrl-C the backend. In the browser, the status pill should flip to "Offline" within ~30 seconds. Restart the backend (`python run.py`). Within a few seconds the pill should flip back to "Live"/"Closed" and rows should update again. No blank UI moment (the localStorage snapshot keeps the last state visible during the gap).

- [ ] **Step 6: Verify auth rejection**

In a private/incognito window with no session cookie, run in the DevTools console:
```js
new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/stream`)
  .addEventListener("close", (e) => console.log("closed", e.code));
```
Expected: log line `closed 4401`.

- [ ] **Step 7: Run every test suite one final time**

```bash
cd backend && python -m tests.test_calculations
cd backend && python -m tests.test_broadcaster
cd frontend && npm test
cd frontend && npm run build
```
Expected: all green.

- [ ] **Step 8: Final commit if anything changed during verification**

If Steps 1-7 revealed no issues, no commit needed. If tweaks were made, commit them with a descriptive message.
