# Real-time streaming redesign: WebSocket + shared broadcaster + deltas

**Status:** design
**Date:** 2026-07-13
**Author:** Josten (with Claude)

## Problem

The dashboard streams the full market state to each browser every 1 second over
Server-Sent Events (`GET /api/stream`, `backend/app/main.py:167`). Price updates
therefore lag the underlying FYERS tick feed by up to a second, and the payload
carries all 82 stocks every frame whether anything changed or not. The
`build_payload()` function also runs **once per connected client per tick**, so
CPU cost scales linearly with the number of viewers.

The user wants prices to feel genuinely live (sub-second) while keeping the
backend cheap enough to serve 2–10 concurrent viewers today and scale to more
later without redesign.

## Goals

- Median observed UI update latency ≤ 300 ms after a FYERS tick (vs ~1 s today).
- Backend CPU per tick is O(1) in the number of connected clients (not O(n)).
- Wire size of a typical frame during trading hours < 2 KB (vs ~15 KB today).
- No per-row re-render in the browser unless that row's data actually changed.

## Non-goals (deferred, YAGNI)

- Binary framing (MessagePack). Keep JSON; revisit if bandwidth becomes an
  issue at higher client counts.
- Per-symbol client subscriptions (only stream the rows the user can see).
- Historical replay / audit log of past frames.
- Multi-instance backend / horizontal scaling of the broadcaster.

## Architecture

```
FYERS WS ticks ─▶ DataEngine._handle_tick ─▶ market_state (in-memory)
                                                    │
                            ┌───────────────────────┘
                            ▼
                Broadcaster (single asyncio task, 250 ms tick)
                            │
             ┌──────────────┴──────────────┐
             │  build_frame():             │
             │   • snapshot state (lock)   │
             │   • diff vs previous frame  │
             │   • serialize once (JSON)   │
             └──────────────┬──────────────┘
                            │  put_nowait on each subscriber queue
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
         WS client A   WS client B   WS client C   (bounded asyncio.Queue)
```

**Key invariant:** frame construction and JSON serialization happen exactly
once per 250 ms tick, regardless of subscriber count. Per-connection work is
`await queue.get()` → `websocket.send_text()`.

## Backend components

### `app/broadcaster.py` (new)

Single class `Broadcaster`:

- `subscribe() -> asyncio.Queue[str]` — returns a bounded queue
  (`maxsize=8`). Each subscribe also atomically flags the subscriber to receive
  a full `snapshot` on its next frame (used both for first-connect and for
  drop-oldest resync, see below).
- `unsubscribe(q)` — remove queue from the fan-out set.
- `_run()` — background task. Every `STREAM_INTERVAL` seconds:
    1. Snapshot `market_state` under lock (returns dict of primitives).
    2. Call `_build_frame(prev_snapshot, new_snapshot)`; returns either a
       `snapshot` frame, a `delta` frame, or `None` if nothing changed
       (nothing is sent to any subscriber in that case — WS-level pings
       handle liveness).
    3. If a frame was produced, serialize once with `json.dumps`.
    4. For each subscriber queue: try `put_nowait`. On `QueueFull`, drain the
       queue and put a fresh `snapshot` frame instead — this is the drop-oldest
       resync path for slow clients.
- `_build_frame()`:
    - Compares each symbol's current values (`ltp`, `pct_change`,
      `relative_strength`, `day_range_pos`, `signal`, `signal_time`,
      `today_low`, `today_high`, `yesterday_low`, `yesterday_high`) against the
      previous snapshot. Only symbols with at least one changed field are
      included, and each included symbol contains only the changed fields plus
      `symbol` as the key.
    - `nifty` block is included only if any of its fields changed.
    - `market_open` / `fyers_connected` are included only when they flip.
    - `seq` monotonically increases across frames from a single server run.

### `app/main.py` changes

- Replace `GET /api/stream` (SSE) with `GET /ws/stream` (WebSocket).
    - Auth: reject with close code `4401` unless
      `security.is_authenticated(websocket)` passes (session cookie).
    - On accept: `q = broadcaster.subscribe()`; then `while True: msg = await
      q.get(); await ws.send_text(msg)`.
    - Also handle inbound `{"type":"resync"}` message from the client (fires
      `broadcaster.mark_resync(q)` which will promote its next frame to a
      snapshot).
    - On any exception / disconnect: `broadcaster.unsubscribe(q)`.
- Lifespan: start `broadcaster.start()` on app startup, `await
  broadcaster.stop()` on shutdown.
- `/api/snapshot` remains as-is (used for offline cache warmup).
- **Remove `range_map` call from the payload path**; math moves to the client
  (see below). The `range_map` function in `calculations.py` stays and its
  unit tests stay — only the caller in `main.build_payload` is removed.

### `app/config.py` changes

- `STREAM_INTERVAL` default: `1.0` → `0.25` seconds.
- New env var `BROADCAST_MAX_QUEUE=8` (bounded queue size per subscriber).

## Wire protocol (JSON over WebSocket)

**Snapshot** (first frame after connect, or after a resync):

```json
{
  "type": "snapshot",
  "seq": 1,
  "market_open": true,
  "fyers_connected": true,
  "nifty": { "ltp": 24812.35, "pct_change": 0.42, "prev_close": 24708.30 },
  "stocks": [
    {
      "symbol": "RELIANCE", "sector": "Energy",
      "ltp": 1487.20, "pct_change": 0.63, "relative_strength": 0.21,
      "day_range_pos": 74, "signal": "Bull C2", "signal_time": "10:03",
      "yesterday_low": 1462.10, "yesterday_high": 1491.80,
      "today_low": 1471.00, "today_high": 1489.55
    }
  ]
}
```

**Delta** (every subsequent 250 ms tick — only what moved):

```json
{
  "type": "delta",
  "seq": 42,
  "nifty":  { "ltp": 24814.10, "pct_change": 0.43 },
  "stocks": [
    { "symbol": "TCS", "ltp": 4218.55, "pct_change": 0.12, "day_range_pos": 68 }
  ]
}
```

Rules:

- `seq` is monotonically increasing per server run. On client-observed gap
  (`seq != last + 1`) or a missing frame beyond the heartbeat window, the
  client sends `{"type":"resync"}` and expects a `snapshot`.
- `sector` is only ever sent in `snapshot` frames (never changes intraday).
- Range fields (`yesterday_low/high`, `today_low/high`) are quasi-static;
  they are sent in `snapshot` and only appear in `delta` when they actually
  change (e.g. new intraday high).

## Frontend components

### `hooks/useMarketStream.js` — rewrite

- Opens a WebSocket to `/ws/stream` (relative URL; Vite proxies in dev, same
  origin in prod).
- Exponential backoff reconnect: 500 ms → 1 s → 2 s → 5 s → cap 10 s. Reset
  on successful `open`.
- Heartbeat: track time of last frame received. If > 30 s, force reconnect.
  (Server sends a WS-level `ping` every 15 s.)
- Maintains an internal store:
    - `Map<symbol, Stock>` for stocks
    - `nifty`, `marketOpen`, `fyersConnected`, `connected`, `lastSeq`
- On `snapshot`: replace store contents.
- On `delta`: for each entry in `stocks`, merge fields into the existing
  `Map` entry (or create a new entry if unknown symbol).
- Exposes:
    - `useMarketMeta()` → `{ marketOpen, fyersConnected, connected, nifty }`
    - `useStock(symbol)` → the current `Stock` object for that row (subscribed
      via `useSyncExternalStore`)
    - `useSymbols()` → the sorted list of known symbols (only changes when
      a symbol is added / removed / when sort-relevant fields change)

Backed by a small hand-rolled store (no external dependency) using
`useSyncExternalStore` for O(1) row-level subscriptions.

### `components/WatchlistRow.jsx`

- Reads its own data via `useStock(stock.symbol)` instead of receiving the
  full row object as a prop. Rows for unchanged symbols receive zero renders
  per tick.
- Imports a JS `rangeMap(y_low, y_high, t_low, t_high, ltp)` mirror of the
  Python `calculations.range_map` (~10 lines).

### `App.jsx`

- Reads `useMarketMeta()` and `useSymbols()`.
- Filter/sort operates on the symbol list + a minimal projection (only the
  fields the current sort/filter cares about) so a single unrelated tick
  doesn't retrigger a full 82-row `.sort()`.
- Passes only `symbol` to each `<WatchlistRow />` (the row hooks its own data).

## Error handling & edge cases

- **Slow client** (queue full): server drops the pending queue, replaces with
  a fresh `snapshot`. Client sees a snapshot and re-syncs silently. No frames
  are ever discarded silently without a resync — clients always converge.
- **Server restart:** client's WebSocket errors → backoff-reconnect → receives
  fresh `snapshot` with `seq=1`. No blank UI (localStorage cache still
  renders during the reconnect gap).
- **Off-market:** broadcaster still ticks at 250 ms but emits no frames
  because nothing is changing. Only the transition frame carrying
  `market_open: false` is sent at market close. Cost is negligible.
- **Auth expiry mid-connection:** the session cookie is validated on
  WebSocket handshake only. If the session expires mid-stream, the stream
  keeps flowing until the client disconnects; the SPA's `/api/auth/me` poll
  (existing, on route change) will surface the expiry.
- **Multi-instance deployment:** out of scope. `DATA_ENGINE_ENABLED=false`
  behaviour is preserved — such an instance simply never emits frames but
  will still accept WS connections (which will time out via heartbeat and
  reconnect). If this becomes a real deployment mode, revisit.

## Testing

### Unit tests

- `test_broadcaster.py`:
    - Empty diff (identical snapshots) → `_build_frame` returns `None`; no
      subscriber queue receives a message that tick.
    - Single stock changed → delta contains only that stock with only the
      changed fields.
    - First frame → `type == "snapshot"`, contains all stocks with all fields.
    - Slow subscriber (queue full) → next frame delivered is a `snapshot`.
    - `seq` is strictly monotonic.
- `test_frontend_store` (Vitest):
    - Applying `snapshot` + N `deltas` produces the same store state as
      applying an equivalent single snapshot.
    - `useStock(sym)` only fires its subscription callback when fields for
      `sym` change (verify via a spy).

### Manual verification (before declaring done)

1. Open dashboard → snapshot arrives, all 82 rows populate within 500 ms.
2. DevTools → Network → WS: delta frames every ~250 ms, typical size < 2 KB.
3. Kill backend → client shows "Offline", reconnects on restart, receives
   snapshot, no blank UI moment.
4. Open 5 tabs → backend CPU stays flat (compute-once fan-out verified via
   a print or metric).
5. React DevTools profiler: sort/filter changes cause only the affected rows
   to re-render; unrelated ticks do not trigger row renders.

## Migration & rollout

- Replace SSE with WebSocket in a single change (no dual-run needed — this
  is not a public service with third-party consumers).
- Deployment note: Caddy passes WebSocket upgrades natively; no config
  change required for the Oracle Cloud deployment.
- No database migration, no persisted state changes.

## Open questions

- None blocking. If future work needs binary encoding or per-symbol
  subscriptions, both can be added behind the existing `/ws/stream` URL by
  content-negotiating on the first frame — no rewrite needed.
