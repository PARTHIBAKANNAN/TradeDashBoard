# WebSocket Real-Time Streaming Integration Design

**Status:** Approved  
**Date:** 2026-07-23  
**Target Branch:** `feature/websocket-integration` (to be merged into `main`)  
**Source Branch:** `feat/realtime-websocket-streaming`  

## Executive Summary

This design document outlines the strategy for bringing full real-time WebSocket streaming capabilities into `main`. The underlying implementation—developed on `feat/realtime-websocket-streaming`—replaces legacy 1-second Server-Sent Events (`GET /api/stream`) with a high-efficiency 250ms delta-streaming WebSocket server (`GET /ws/stream`) and a fine-grained reactive frontend store (`marketStore`).

To preserve safety and isolate integration verification from `main`, all work will be executed on a dedicated integration branch: `feature/websocket-integration`.

---

## 1. Branching & Integration Strategy

1. **Branch Creation**: Create `feature/websocket-integration` rooted at current `main` HEAD (`387fdfed`).
2. **Merge Strategy (Option 1 - Standard Merge)**:
   - Perform a standard git merge of `feat/realtime-websocket-streaming` into `feature/websocket-integration`.
   - Preserves all 14 granular commits detailing the development of broadcaster runtime, WS endpoint, reactive store, and Vitest test suites.
   - Zero merge conflicts expected since `main` has not diverged from the original merge-base.
3. **Verification Gate**: Run full backend test suite (`pytest`) and frontend test suite (`vitest`) on `feature/websocket-integration`.
4. **Final Integration**: Once verified, merge `feature/websocket-integration` into `main`.

---

## 2. Architecture & Data Flow

```
FYERS WS ticks ──▶ DataEngine (in-memory state)
                          │
                          ▼
          Broadcaster (single asyncio task, 250ms tick)
                          │
            ┌─────────────┴─────────────┐
            │  build_frame() (JSON diff)│
            └─────────────┬─────────────┘
                          │ (single JSON string put to queues)
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
      WS Client A    WS Client B    WS Client C (bounded asyncio.Queue)
```

- **Per-Tick Invariant**: Frame construction and JSON serialization happen **exactly once** per 250ms tick regardless of client count ($O(1)$ backend CPU complexity).
- **Per-Connection Delivery**: `await queue.get()` → `websocket.send_text()`.

---

## 3. Backend Components

### 3.1 `backend/app/broadcaster.py`
- **Single Broadcaster Task**: `Broadcaster` singleton running an `asyncio` loop every 250ms (`STREAM_INTERVAL`).
- **Subscription Management**:
  - `subscribe() -> asyncio.Queue[str]`: Bounded queue (`maxsize=8`). Flags subscriber for an initial `snapshot` frame.
  - `unsubscribe(queue)`: Removes client from fan-out list.
- **Diff Engine (`_build_frame`)**:
  - Compares current symbol values (`ltp`, `pct_change`, `relative_strength`, `day_range_pos`, `signal`, `signal_time`, `today_low`, `today_high`, `yesterday_low`, `yesterday_high`) against previous frame snapshot.
  - Only includes changed symbols, and only the specific modified fields plus `symbol`.
  - Includes `nifty` block only when its fields change.
  - Includes `market_open` / `fyers_connected` flags on status transitions.
- **Resilience & Slow Client Handling**:
  - Drops oldest frames on `QueueFull` and queues a fresh full `snapshot` frame to resync slow clients without blocking the tick loop.
  - Emits heartbeat frames during quiet market periods.

### 3.2 `backend/app/main.py`
- **Endpoint**: `GET /ws/stream` replacing `GET /api/stream` SSE.
- **Authentication**: Inspects session cookie via `security.is_authenticated()`. If unauthorized, rejects connection with close code `4401`.
- **Client Protocol**: Listens for inbound JSON messages (e.g. `{"type":"resync"}`) to trigger an immediate full snapshot.

---

## 4. Frontend Components

### 4.1 `frontend/src/store/marketStore.js`
- **Reactive Market Store**: In-memory store maintaining symbol state dict and Nifty index state.
- **Granular Subscriptions**: `subscribeSymbol(symbol, callback)` allows UI components to subscribe strictly to their symbol's updates.
- **Delta Merging**: Merges incoming delta frames into the store and notifies only affected symbol listeners.

### 4.2 `frontend/src/hooks/useMarketStream.js`
- **WebSocket Client**: Connects to `ws://.../ws/stream` with automatic reconnect backoff and lifecycle management.
- **Granular Hooks**:
  - `useStock(symbol)`: Returns live price object for a specific symbol; triggers re-render **only** when that symbol updates.
  - `useSymbols()`: Returns array of active symbols for table structure.

### 4.3 UI Component Optimization (`frontend/src/components/WatchlistRow.jsx`)
- Replaces coarse full-table re-renders with `useStock(symbol)` subscriptions per row.

---

## 5. Testing & Verification Plan

### 5.1 Automated Backend Tests
- Command: `pytest backend/tests/test_broadcaster.py`
- Coverage:
  - `build_frame()` diff calculations (full snapshot vs delta vs no-op).
  - WS connection lifecycle & auth 4401 handling.
  - Inbound resync message handling.
  - Graceful shutdown and queue overflow resync.

### 5.2 Automated Frontend Tests
- Command: `npx vitest run` (or `npm run test` inside `frontend/`)
- Coverage:
  - `marketStore` symbol subscription & delta merging (`marketStore.test.js`).
  - Range mapping calculations (`rangeMap.test.js`).

---

## 6. Spec Self-Review

1. **Placeholder Scan**: Verified. No TBD, TODO, or vague requirements present.
2. **Internal Consistency**: Verified. Architecture matches codebase implementation in `feat/realtime-websocket-streaming`.
3. **Scope Check**: Clear and self-contained integration plan suitable for single implementation phase.
4. **Ambiguity Check**: Specified exact branch names, merge strategy (Option 1 - standard merge), endpoints (`/ws/stream`), and test commands.
