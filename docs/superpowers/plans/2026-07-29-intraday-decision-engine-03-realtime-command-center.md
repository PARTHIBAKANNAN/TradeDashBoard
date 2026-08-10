# Real-time Command Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace per-client SSE snapshots with shared WebSocket deltas and deliver the desktop-first Signal Command Center, Setup Inspector, alert center, and upgraded Full Scanner.

**Architecture:** A single backend broadcaster serializes authoritative market and decision snapshots once, then fans bounded messages to authenticated clients. A small frontend external store merges snapshots/deltas and offers granular subscriptions. The UI never recomputes scores, lifecycle state, or trade levels.

**Tech Stack:** FastAPI WebSockets, asyncio, React 18, `useSyncExternalStore`, Vite, Tailwind CSS, Vitest, Testing Library, Canvas/SVG chart rendering.

## Global Constraints

- Target 1920 × 1080 desktop first.
- Keep Top 10 Long, Top 10 Short, and Setup Inspector simultaneously visible.
- Preserve the existing login and FYERS-connect workflows.
- Build and serialize one live frame regardless of client count.
- Send prices at approximately 250 ms and decisions when the five-second snapshot changes.
- Retain the last browser snapshot but label it offline/stale.
- Do not place or manage orders.
- Browser notification permission must follow a user gesture.
- Unchanged stock rows must not rerender for unrelated symbols.

## File Structure

- `backend/app/stream/protocol.py` — snapshot/delta wire contracts.
- `backend/app/stream/broadcaster.py` — compute-once bounded fan-out.
- `backend/app/main.py` — authenticated `/ws/stream` and REST fallback.
- `frontend/src/api/marketStore.js` — normalized external live store.
- `frontend/src/api/useMarketStream.js` — WebSocket lifecycle and resync.
- `frontend/src/app/AppShell.jsx` — authenticated shell and navigation.
- `frontend/src/pages/CommandCenter.jsx` — market strip, two stacks, inspector.
- `frontend/src/pages/FullScanner.jsx` — all-stock exploration.
- `frontend/src/components/command/*` — focused Command Center components.
- `frontend/src/components/alerts/*` — alert center and browser delivery.
- `frontend/src/components/scanner/*` — upgraded scanner row and controls.

---

### Task 1: Implement the shared snapshot/delta WebSocket backend

**Files:**
- Create: `backend/app/stream/__init__.py`
- Create: `backend/app/stream/protocol.py`
- Create: `backend/app/stream/broadcaster.py`
- Create: `backend/tests/test_broadcaster.py`
- Create: `backend/tests/test_websocket.py`
- Modify: `backend/app/main.py:1-70,157-184`
- Modify: `backend/app/config.py:28-49`

**Interfaces:**
- Consumes: `MarketState.snapshot()`, `DecisionEvaluator.latest()`.
- Produces:
  - `build_snapshot(market, decisions) -> dict`
  - `build_delta(previous, current, seq) -> dict | None`
  - `Broadcaster.subscribe() -> asyncio.Queue[str]`
  - `Broadcaster.mark_resync(queue) -> None`
  - `Broadcaster.publish_once() -> None` for one deterministic run-loop cycle
  - authenticated `/ws/stream`.

- [ ] **Step 1: Write failing broadcaster tests**

```python
# backend/tests/test_broadcaster.py
import json

import pytest

from app.stream.broadcaster import Broadcaster
from app.stream.protocol import build_delta


def test_delta_contains_only_changed_symbol_fields():
    before = {
        "meta": {"market_open": True},
        "stocks": [
            {"symbol": "TCS", "ltp": 100, "score": 80},
            {"symbol": "INFY", "ltp": 200},
        ],
    }
    after = {
        "meta": {"market_open": True},
        "stocks": [
            {"symbol": "TCS", "ltp": 101, "score": 80},
            {"symbol": "INFY", "ltp": 200},
        ],
    }
    delta = build_delta(before, after, seq=2)
    assert delta["type"] == "delta"
    assert delta["seq"] == 2
    assert delta["stocks"] == [{"symbol": "TCS", "ltp": 101}]


def test_empty_diff_returns_none():
    snapshot = {"meta": {"market_open": True}, "stocks": []}
    assert build_delta(snapshot, snapshot, seq=2) is None


@pytest.mark.asyncio
async def test_first_delivery_is_snapshot_and_sequences_increase():
    box = {"snapshot": {"meta": {"market_open": True}, "stocks": []}}
    broadcaster = Broadcaster(lambda: box["snapshot"], max_queue=2)
    queue = broadcaster.subscribe()
    await broadcaster.publish_once()
    first = json.loads(await queue.get())
    box["snapshot"] = {
        "meta": {"market_open": True},
        "stocks": [{"symbol": "TCS", "ltp": 101}],
    }
    await broadcaster.publish_once()
    second = json.loads(await queue.get())
    assert first["type"] == "snapshot"
    assert second["seq"] > first["seq"]


@pytest.mark.asyncio
async def test_full_queue_is_replaced_by_a_fresh_snapshot():
    box = {"snapshot": {"meta": {}, "stocks": []}}
    broadcaster = Broadcaster(lambda: box["snapshot"], max_queue=1)
    queue = broadcaster.subscribe()
    await broadcaster.publish_once()
    box["snapshot"] = {"meta": {}, "stocks": [{"symbol": "TCS", "ltp": 102}]}
    await broadcaster.publish_once()
    frame = json.loads(await queue.get())
    assert frame["type"] == "snapshot"
    assert frame["stocks"][0]["ltp"] == 102
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_broadcaster.py tests/test_websocket.py -q`

Expected: FAIL because the stream package and WebSocket route do not exist.

- [ ] **Step 3: Implement protocol and fan-out**

```python
# backend/app/stream/broadcaster.py
class Broadcaster:
    def __init__(self, snapshot_fn, interval=0.25, max_queue=8):
        self.snapshot_fn = snapshot_fn
        self.interval = interval
        self.max_queue = max_queue
        self.subscribers = {}
        self.previous = None
        self.seq = 0

    def subscribe(self):
        queue = asyncio.Queue(maxsize=self.max_queue)
        self.subscribers[queue] = True
        return queue

    def mark_resync(self, queue):
        if queue in self.subscribers:
            self.subscribers[queue] = True
```

The run loop snapshots and serializes once per interval. Each subscriber marked
for resync receives a snapshot. For a full queue, drain it and enqueue the
current snapshot. Emit a heartbeat frame after 15 seconds without data changes.

Add `/ws/stream`; reject unauthenticated connections with code `4401`, run one
send task and one receive task, accept `{"type":"resync"}`, and unsubscribe in
`finally`. Start/stop the broadcaster from FastAPI lifespan. Keep
`/api/snapshot` during migration and remove `/api/stream` only after frontend
Task 2 passes.

- [ ] **Step 4: Run protocol, route, and regression tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_broadcaster.py tests/test_websocket.py tests/test_health.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/stream backend/app/main.py backend/app/config.py backend/tests/test_broadcaster.py backend/tests/test_websocket.py
git commit -m "feat: broadcast shared WebSocket deltas"
```

### Task 2: Add frontend tests, normalized store, and WebSocket recovery

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/test/factories.js`
- Create: `frontend/src/test/storeHarness.jsx`
- Create: `frontend/src/api/marketStore.js`
- Create: `frontend/src/api/marketStore.test.js`
- Rewrite: `frontend/src/hooks/useMarketStream.js`
- Create: `frontend/src/hooks/useMarketStream.test.jsx`

**Interfaces:**
- Consumes: snapshot/delta protocol from Task 1.
- Produces:
  - `marketStore.applyFrame(frame)`
  - `marketStore.getMeta()`
  - `marketStore.getStock(symbol)`
  - `marketStore.getOpportunityLists()`
  - `marketStore.subscribeMeta(listener)`
  - `marketStore.subscribeStock(symbol, listener)`
  - `useMarketConnection()`.

- [ ] **Step 1: Install and configure frontend testing**

Run:

```powershell
cd frontend
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom jsdom
```

Add scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

Merge these keys into the existing `scripts` object; preserve the current
`dev`, `build`, and `lint` commands.

Configure Vitest with `environment: "jsdom"`, `globals: true`, and
`setupFiles: "./src/test/setup.js"`. Add `/ws` to the Vite proxy with
`ws: true`.

Create shared test helpers:

```javascript
// frontend/src/test/factories.js
export function makeRows(count, direction) {
  return Array.from({ length: count }, (_, index) => ({
    setup_id: `${direction}-${index}`,
    symbol: `${direction.toUpperCase()}${index}`,
    direction,
    rank: index + 1,
    score: { display_score: 90 - index, complete: true },
    state: "watching",
  }));
}

export function setupFixture(overrides = {}) {
  return {
    setup_id: "long-0",
    symbol: "TCS",
    direction: "long",
    score: { display_score: 86, components: {} },
    evidence: ["Relative strength confirmed"],
    warnings: [],
    blockers: ["Sector coverage below 70%"],
    state: "armed",
    plan: { trigger: 100, stop: 98, t1: 102, t2: 104 },
    candles: [],
    overlays: [],
    events: [],
    ...overrides,
  };
}

export const scannerFixture = [
  { symbol: "TCS", sector: "IT", direction: "long", state: "armed", score: 84, score_complete: true },
  { symbol: "INFY", sector: "IT", direction: "long", state: "armed", score: 81, score_complete: true },
  { symbol: "RELIANCE", sector: "Energy", direction: "short", state: "watching", score: 79, score_complete: true },
];
```

```jsx
// frontend/src/test/storeHarness.jsx
import { fireEvent, screen } from "@testing-library/react";
import { marketStore } from "../api/marketStore.js";

export const seedMeta = (meta) => marketStore.seedForTest({ meta });
export const seedOpportunities = (opportunities) =>
  marketStore.seedForTest({ opportunities });
export const seedScannerRows = (stocks) => marketStore.seedForTest({ stocks });
export const select = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
export const fill = (label, value) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
export function setViewport(width, height) {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  window.dispatchEvent(new Event("resize"));
}
```

Expose `seedForTest` only when `import.meta.env.MODE === "test"`; production
code must not call it.

- [ ] **Step 2: Write failing store tests**

```javascript
// frontend/src/api/marketStore.test.js
import { vi } from "vitest";
import { createMarketStore } from "./marketStore.js";

it("notifies only the changed symbol subscriber", () => {
  const store = createMarketStore();
  store.applyFrame({
    type: "snapshot",
    seq: 1,
    stocks: [{ symbol: "TCS", ltp: 100 }, { symbol: "INFY", ltp: 200 }],
  });
  const tcs = vi.fn();
  const infy = vi.fn();
  store.subscribeStock("TCS", tcs);
  store.subscribeStock("INFY", infy);
  store.applyFrame({ type: "delta", seq: 2, stocks: [{ symbol: "TCS", ltp: 101 }] });
  expect(tcs).toHaveBeenCalledTimes(1);
  expect(infy).not.toHaveBeenCalled();
});

it("requests resync on a sequence gap", () => {
  const store = createMarketStore();
  store.applyFrame({ type: "snapshot", seq: 4, stocks: [] });
  expect(store.applyFrame({ type: "delta", seq: 6, stocks: [] })).toEqual({
    needsResync: true,
  });
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run: `cd frontend; npm test -- marketStore.test.js`

Expected: FAIL because the store does not exist.

- [ ] **Step 4: Implement store and connection hook**

```javascript
// frontend/src/api/marketStore.js
export function createMarketStore() {
  const stocks = new Map();
  const stockListeners = new Map();
  const metaListeners = new Set();
  let meta = { connected: false, stale: true, seq: 0 };
  let opportunities = { long: [], short: [] };

  function notifyStock(symbol) {
    stockListeners.get(symbol)?.forEach((listener) => listener());
  }

  function applyFrame(frame) {
    if (frame.type === "delta" && frame.seq !== meta.seq + 1) {
      return { needsResync: true };
    }
    if (frame.type === "snapshot") {
      stocks.clear();
      opportunities = frame.opportunities || { long: [], short: [] };
    } else if (frame.opportunities) {
      opportunities = { ...opportunities, ...frame.opportunities };
    }
    for (const patch of frame.stocks || []) {
      stocks.set(patch.symbol, { ...stocks.get(patch.symbol), ...patch });
      notifyStock(patch.symbol);
    }
    meta = { ...meta, ...frame.meta, seq: frame.seq, connected: true, stale: false };
    metaListeners.forEach((listener) => listener());
    return { needsResync: false };
  }

  function subscribeStock(symbol, listener) {
    const listeners = stockListeners.get(symbol) || new Set();
    listeners.add(listener);
    stockListeners.set(symbol, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) stockListeners.delete(symbol);
    };
  }

  const store = {
    applyFrame,
    getMeta: () => meta,
    getStock: (symbol) => stocks.get(symbol),
    getOpportunityLists: () => opportunities,
    subscribeMeta(listener) {
      metaListeners.add(listener);
      return () => metaListeners.delete(listener);
    },
    subscribeStock,
  };

  if (import.meta.env.MODE === "test") {
    store.seedForTest = ({
      meta: nextMeta,
      stocks: nextStocks,
      opportunities: nextOpportunities,
      seq,
    }) => {
      if (nextStocks) {
        stocks.clear();
        nextStocks.forEach((stock) => stocks.set(stock.symbol, stock));
      }
      if (nextOpportunities) opportunities = nextOpportunities;
      meta = {
        ...meta,
        ...nextMeta,
        ...(seq === undefined ? {} : { seq }),
      };
    };
  }

  return store;
}

export const marketStore = createMarketStore();
```

The hook must use exponential reconnect delays
`500, 1000, 2000, 5000, 10000` ms, send `{"type":"resync"}` on sequence gaps,
force reconnect after 30 seconds without a frame, and cache only the latest
full snapshot in `localStorage`.

- [ ] **Step 5: Run frontend tests and remove SSE**

Run: `cd frontend; npm test`

Expected: PASS.

After the hook uses `/ws/stream`, delete the SSE implementation from
`backend/app/main.py` and its unused imports. Run backend WebSocket tests again.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.js frontend/src/test frontend/src/api frontend/src/hooks backend/app/main.py
git commit -m "feat: consume resilient market WebSocket"
```

### Task 3: Decompose the application shell and navigation

**Files:**
- Create: `frontend/src/app/AppShell.jsx`
- Create: `frontend/src/app/AuthGate.jsx`
- Create: `frontend/src/app/navigation.js`
- Create: `frontend/src/pages/DeferredPage.jsx`
- Create: `frontend/src/pages/LegacyScanner.jsx`
- Create: `frontend/src/app/AppShell.test.jsx`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: existing auth endpoints and `useMarketConnection`.
- Produces: navigation among `command`, `scanner`, `analytics`, and `settings`; authenticated `AppShell`.

- [ ] **Step 1: Write the failing navigation test**

```javascript
// frontend/src/app/AppShell.test.jsx
import { fireEvent, render, screen } from "@testing-library/react";
import AppShell from "./AppShell.jsx";

it("opens the full scanner without losing the selected symbol", () => {
  render(<AppShell initialView="command" initialSymbol="TCS" />);
  fireEvent.click(screen.getByRole("button", { name: "Full Scanner" }));
  expect(screen.getByRole("heading", { name: "Full Scanner" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveAttribute("data-selected-symbol", "TCS");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend; npm test -- AppShell.test.jsx`

Expected: FAIL because `AppShell` does not exist.

- [ ] **Step 3: Extract the shell**

Keep login, logout, FYERS connect, and splash behavior in `AuthGate.jsx`.
`AppShell` owns only navigation, selected symbol, notification-center state,
and the persistent top-level status region:

```javascript
// frontend/src/app/navigation.js
export const VIEWS = [
  ["command", "Command Center"],
  ["scanner", "Full Scanner"],
  ["analytics", "Analytics"],
  ["settings", "Settings"],
];
```

```jsx
// frontend/src/pages/DeferredPage.jsx
export default function DeferredPage({ title, message }) {
  return (
    <section>
      <h1>{title}</h1>
      <p>{message}</p>
    </section>
  );
}
```

```jsx
// frontend/src/app/AppShell.jsx
import { useState } from "react";
import DeferredPage from "../pages/DeferredPage.jsx";
import LegacyScanner from "../pages/LegacyScanner.jsx";
import { VIEWS } from "./navigation.js";

function PrimaryNav({ views, active, onChange }) {
  return (
    <nav aria-label="Primary">
      {views.map(([id, label]) => (
        <button
          aria-current={active === id ? "page" : undefined}
          key={id}
          onClick={() => onChange(id)}
          type="button"
        >
          {label}
        </button>
      ))}
    </nav>
  );
}

function renderView({ view, selectedSymbol, setSelectedSymbol }) {
  if (view === "scanner") {
    return <LegacyScanner selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />;
  }
  if (view === "analytics") {
    return <DeferredPage title="Analytics" message="Analytics arrives in Plan 4." />;
  }
  if (view === "settings") {
    return <DeferredPage title="Settings" message="Settings arrive in Plan 4." />;
  }
  return (
    <DeferredPage
      title="Command Center"
      message={selectedSymbol ? `Selected: ${selectedSymbol}` : "Waiting for live data"}
    />
  );
}

export default function AppShell({ initialView = "command", initialSymbol = null }) {
  const [view, setView] = useState(initialView);
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  return (
    <div className="app-shell">
      <PrimaryNav views={VIEWS} active={view} onChange={setView} />
      <main data-selected-symbol={selectedSymbol || ""}>
        {renderView({ view, selectedSymbol, setSelectedSymbol })}
      </main>
    </div>
  );
}
```

Do not add a routing dependency. Preserve selected symbol when moving between
Command Center and Full Scanner.

Move the current scanner controls and table into `LegacyScanner.jsx` without
changing its filters or visible fields. Adapt it to the market store created in
Task 2, give its top-level heading the accessible name `Full Scanner`, and have
row clicks call `onSelect(symbol)`. Task 7 removes this compatibility page after
the upgraded scanner reaches parity.

- [ ] **Step 4: Run navigation and build checks**

Run: `cd frontend; npm test -- AppShell.test.jsx`

Run: `cd frontend; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/main.jsx frontend/src/index.css frontend/src/app frontend/src/pages/DeferredPage.jsx frontend/src/pages/LegacyScanner.jsx
git commit -m "refactor: split authenticated application shell"
```

### Task 4: Build the market strip and parallel opportunity stacks

**Files:**
- Create: `frontend/src/pages/CommandCenter.jsx`
- Create: `frontend/src/components/command/MarketStrip.jsx`
- Create: `frontend/src/components/command/OpportunityStack.jsx`
- Create: `frontend/src/components/command/OpportunityRow.jsx`
- Create: `frontend/src/components/command/CommandCenter.test.jsx`
- Modify: `frontend/src/app/AppShell.jsx`

**Interfaces:**
- Consumes: market-store metadata and authoritative `long`/`short` opportunity lists.
- Produces: selected symbol callback and visible top-ten stacks.

- [ ] **Step 1: Write failing Command Center tests**

```javascript
// frontend/src/components/command/CommandCenter.test.jsx
import { render, screen } from "@testing-library/react";
import { makeRows } from "../../test/factories.js";
import { seedMeta, seedOpportunities } from "../../test/storeHarness.jsx";
import CommandCenter from "../../pages/CommandCenter.jsx";


it("shows both directions and caps each list at ten", () => {
  seedOpportunities({ long: makeRows(12, "long"), short: makeRows(11, "short") });
  render(<CommandCenter />);
  expect(screen.getByRole("heading", { name: "Top 10 Long" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Top 10 Short" })).toBeInTheDocument();
  expect(screen.getAllByTestId("long-opportunity")).toHaveLength(10);
  expect(screen.getAllByTestId("short-opportunity")).toHaveLength(10);
});

it("shows the 11:15 mode transition from server metadata", () => {
  seedMeta({ session_mode: "intraday", previous_mode: "opening" });
  render(<CommandCenter />);
  expect(screen.getByText("Intraday Mode")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend; npm test -- CommandCenter.test.jsx`

Expected: FAIL because Command Center components do not exist.

- [ ] **Step 3: Implement the decision hierarchy**

`MarketStrip` must render NIFTY, advancing/declining counts, long/short breadth,
leading/lagging sectors, session mode, server clock, and compact subsystem
health. `OpportunityRow` must render rank, rank delta, symbol, sector, score,
score delta, price/change, setup, lifecycle, trigger distance, freshness, and
alert status.

Use native buttons for rows and preserve a visible focus state. Subscribe each
row by setup/symbol key so a price update outside the two lists cannot rerender
the stacks.

Replace the command `DeferredPage` branch in `AppShell` with:

```jsx
<CommandCenter selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
```

- [ ] **Step 4: Run tests and React render profiling assertion**

Run: `cd frontend; npm test -- CommandCenter.test.jsx marketStore.test.js`

Expected: PASS; the store test proves unrelated stock subscribers are silent.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/CommandCenter.jsx frontend/src/components/command frontend/src/app/AppShell.jsx
git commit -m "feat: add long and short opportunity stacks"
```

### Task 5: Build the Setup Inspector and compact chart

**Files:**
- Create: `frontend/src/components/command/SetupInspector.jsx`
- Create: `frontend/src/components/command/ScoreBreakdown.jsx`
- Create: `frontend/src/components/command/TradeFramework.jsx`
- Create: `frontend/src/components/command/IntradayChart.jsx`
- Create: `frontend/src/components/command/SetupInspector.test.jsx`
- Modify: `frontend/src/pages/CommandCenter.jsx`

**Interfaces:**
- Consumes: selected setup detail containing candles, VWAP/ORB, evidence, blockers, frozen plan, and event timeline.
- Produces: accessible inspector and chart with trigger/stop/T1/T2 overlays.

- [ ] **Step 1: Write failing inspector tests**

```javascript
// frontend/src/components/command/SetupInspector.test.jsx
import { render, screen } from "@testing-library/react";
import { setupFixture } from "../../test/factories.js";
import SetupInspector from "./SetupInspector.jsx";


it("labels a score as rule alignment rather than probability", () => {
  render(<SetupInspector setup={setupFixture({
    score: { display_score: 86, components: {} },
  })} />);
  expect(screen.getByText("86 / 100")).toBeInTheDocument();
  expect(screen.getByText(/rule alignment/i)).toBeInTheDocument();
  expect(screen.queryByText(/86% probability/i)).not.toBeInTheDocument();
});

it("renders frozen trade levels and blockers", () => {
  render(<SetupInspector setup={setupFixture()} />);
  for (const label of ["Trigger", "Stop", "T1", "T2"]) {
    expect(screen.getByText(label)).toBeInTheDocument();
  }
  expect(screen.getByText("Sector coverage below 70%")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend; npm test -- SetupInspector.test.jsx`

Expected: FAIL because inspector components do not exist.

- [ ] **Step 3: Implement inspector and chart adapter**

Use a DPR-aware `<canvas>` for candles and overlays. The component receives
data and draws only; it performs no scoring or level calculations.

```jsx
<section aria-label={`${setup.symbol} setup inspector`}>
  <SetupHeader setup={setup} />
  <IntradayChart candles={setup.candles} overlays={setup.overlays} />
  <ScoreBreakdown components={setup.score.components} />
  <EvidenceList evidence={setup.evidence} warnings={setup.warnings} />
  <TradeFramework plan={setup.plan} frozen={setup.state !== "watching"} />
  <EventTimeline events={setup.events} />
</section>
```

Provide a text summary of chart levels for screen readers. Render missing data
as unavailable, never as zero.

- [ ] **Step 4: Run inspector tests and production build**

Run: `cd frontend; npm test -- SetupInspector.test.jsx`

Run: `cd frontend; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/command frontend/src/pages/CommandCenter.jsx
git commit -m "feat: explain selected trade setups"
```

### Task 6: Add in-dashboard, sound, and browser alerts

**Files:**
- Create: `frontend/src/components/alerts/NotificationCenter.jsx`
- Create: `frontend/src/components/alerts/AlertToast.jsx`
- Create: `frontend/src/components/alerts/alertDelivery.js`
- Create: `frontend/src/components/alerts/alerts.test.jsx`
- Modify: `frontend/src/app/AppShell.jsx`

**Interfaces:**
- Consumes: unique lifecycle `triggered` events from market store.
- Produces:
  - `createAlertDelivery({notify, play, storage}) -> {deliver, notify, play}`
  - unread alert list, one toast, optional sound, optional browser notification,
    and setup selection.

- [ ] **Step 1: Write failing delivery tests**

```javascript
// frontend/src/components/alerts/alerts.test.jsx
import { afterEach, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import NotificationCenter from "./NotificationCenter.jsx";
import { createAlertDelivery } from "./alertDelivery.js";

beforeEach(() => vi.stubGlobal("Notification", {
  permission: "default",
  requestPermission: vi.fn().mockResolvedValue("granted"),
}));
afterEach(() => vi.unstubAllGlobals());

const triggeredEvent = {
  event_id: "event-1",
  event_type: "triggered",
  setup_id: "long-0",
  symbol: "TCS",
  direction: "long",
};


it("delivers a setup event only once", () => {
  const delivery = createAlertDelivery({ notify: vi.fn(), play: vi.fn() });
  delivery.deliver(triggeredEvent);
  delivery.deliver(triggeredEvent);
  expect(delivery.notify).toHaveBeenCalledTimes(1);
});

it("does not request browser permission without a user action", () => {
  render(<NotificationCenter alerts={[]} />);
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Enable browser alerts" }));
  expect(Notification.requestPermission).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend; npm test -- alerts.test.jsx`

Expected: FAIL because alert components do not exist.

- [ ] **Step 3: Implement idempotent delivery**

Track delivered `event_id` values in a bounded set persisted to local storage.
Notification copy must include symbol, direction, setup, score, trigger, stop,
T1, and T2. Denied/unsupported browser notifications fall back to the toast and
notification center. Sound is off by default and can only be enabled through a
button.

- [ ] **Step 4: Run alert and shell tests**

Run: `cd frontend; npm test -- alerts.test.jsx AppShell.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/alerts frontend/src/app/AppShell.jsx
git commit -m "feat: deliver deduplicated setup alerts"
```

### Task 7: Upgrade the Full Scanner

**Files:**
- Create: `frontend/src/pages/FullScanner.jsx`
- Create: `frontend/src/components/scanner/ScannerControls.jsx`
- Create: `frontend/src/components/scanner/ScannerTable.jsx`
- Create: `frontend/src/components/scanner/ScannerRow.jsx`
- Create: `frontend/src/components/scanner/scannerFilters.js`
- Create: `frontend/src/components/scanner/FullScanner.test.jsx`
- Modify: `frontend/src/app/AppShell.jsx`
- Remove after parity: `frontend/src/pages/LegacyScanner.jsx`
- Remove after parity: `frontend/src/components/WatchlistRow.jsx`

**Interfaces:**
- Consumes: all normalized stocks and setup projections.
- Produces: search/filter/sort, column visibility, saved local views, selected symbol callback.

- [ ] **Step 1: Write failing filter tests**

```javascript
// frontend/src/components/scanner/FullScanner.test.jsx
import { render, screen } from "@testing-library/react";
import { scannerFixture } from "../../test/factories.js";
import { fill, seedScannerRows, select } from "../../test/storeHarness.jsx";
import FullScanner from "../../pages/FullScanner.jsx";


it("combines direction, lifecycle, score, sector, and freshness filters", () => {
  seedScannerRows(scannerFixture);
  render(<FullScanner />);
  select("Direction", "Long");
  select("Lifecycle", "Armed");
  fill("Minimum score", "80");
  expect(screen.getAllByRole("row")).toHaveLength(3);
});

it("keeps incomplete candidates visible when requested", () => {
  seedScannerRows([{ symbol: "TCS", score_complete: false }]);
  render(<FullScanner />);
  expect(screen.getByText("Incomplete")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend; npm test -- FullScanner.test.jsx`

Expected: FAIL because the new scanner does not exist.

- [ ] **Step 3: Implement scanner parity plus advanced controls**

Keep current LTP, percentage change, relative strength, signal, range
visualization, and sector fields. Add score, component columns, direction,
setup, lifecycle, and freshness. Save only serializable filter/column settings
under a versioned local-storage key. Selecting any row must update the shared
selected symbol and open the Setup Inspector.

Replace the scanner `DeferredPage` branch in `AppShell` with:

```jsx
<FullScanner selectedSymbol={selectedSymbol} onSelect={setSelectedSymbol} />
```

- [ ] **Step 4: Run scanner tests and build**

Run: `cd frontend; npm test -- FullScanner.test.jsx`

Run: `cd frontend; npm run build`

Expected: PASS; no existing scanner field is lost.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FullScanner.jsx frontend/src/pages/LegacyScanner.jsx frontend/src/components/scanner frontend/src/components/WatchlistRow.jsx frontend/src/app/AppShell.jsx
git commit -m "feat: upgrade the full stock scanner"
```

### Task 8: Verify stale states, accessibility, responsive fallback, and rendering

**Files:**
- Create: `frontend/src/components/system/ConnectionBanner.jsx`
- Create: `frontend/src/components/system/HealthPopover.jsx`
- Create: `frontend/src/components/system/systemStates.test.jsx`
- Create: `frontend/src/styles/dashboard.css`
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/app/AppShell.jsx`
- Modify: `frontend/src/pages/CommandCenter.jsx`

**Interfaces:**
- Consumes: store connectivity, freshness, subsystem health, viewport width.
- Produces: visible live/stale/offline/degraded states and desktop/laptop layouts.

- [ ] **Step 1: Write failing degraded-state tests**

```javascript
// frontend/src/components/system/systemStates.test.jsx
import { render, screen } from "@testing-library/react";
import AppShell from "../../app/AppShell.jsx";
import CommandCenter from "../../pages/CommandCenter.jsx";
import { seedMeta, setViewport } from "../../test/storeHarness.jsx";


it("never presents cached prices as live", () => {
  seedMeta({ connected: false, stale: true, cached_at: "2026-07-29T10:00:00+05:30" });
  render(<AppShell />);
  expect(screen.getByText("Offline snapshot")).toBeInTheDocument();
  expect(screen.queryByText(/^Live$/)).not.toBeInTheDocument();
});

it("moves the inspector into a drawer below desktop width", () => {
  setViewport(1366, 768);
  render(<CommandCenter />);
  expect(screen.getByRole("button", { name: "Open setup inspector" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend; npm test -- systemStates.test.jsx`

Expected: FAIL because degraded-state components do not exist.

- [ ] **Step 3: Implement system states and layout rules**

At 1440 px and above, show both opportunity stacks and the inspector. Below
1440 px, show tabbed Long/Short stacks and place the inspector in an accessible
drawer. Use `aria-live="polite"` for connection transitions but not for each
price tick. Respect `prefers-reduced-motion`; never rely on red/green color
alone.

- [ ] **Step 4: Run the complete frontend and backend suites**

Run: `cd frontend; npm test`

Run: `cd frontend; npm run build`

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests -q`

Expected: PASS.

- [ ] **Step 5: Perform a ten-client local smoke test**

Start the backend with replayed/synthetic data and open ten WebSocket clients.
Record one minute of broadcaster metrics. Expected:

- Exactly one frame build per 250 ms interval, not one per client.
- Subscriber queues remain bounded at eight.
- Typical unchanged intervals emit no market delta.
- Median non-snapshot delta payload remains below 2 KB.
- Browser remains interactive at 1920 × 1080.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/system frontend/src/styles frontend/src/index.css frontend/src/app/AppShell.jsx frontend/src/pages/CommandCenter.jsx
git commit -m "feat: harden command center system states"
```

## Plan 3 Completion Gate

Verify:

- Login and FYERS connection still work.
- WebSocket reconnect and resync never blank the UI.
- Top-ten long and short stacks and the inspector fit at 1920 × 1080.
- A triggered event produces at most one toast, sound, and browser notification.
- Cached/offline content is unmistakably labelled.
- Full Scanner preserves all existing information and adds score/lifecycle data.
- Frontend tests, backend tests, and production build pass.

Proceed to Plan 4 only after this gate passes.
