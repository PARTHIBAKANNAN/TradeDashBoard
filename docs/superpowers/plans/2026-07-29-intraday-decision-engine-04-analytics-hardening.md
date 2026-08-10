# Analytics and Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add honest signal analytics, persisted runtime settings, NSE session correctness, authentication safeguards, backups, and measurable production acceptance gates.

**Architecture:** Analytics reads immutable lifecycle/outcome records through paginated REST queries; it never joins the latency-sensitive WebSocket path. Runtime scoring settings are server-authoritative and transactionally persisted, while display/notification preferences remain client-side. Exchange sessions are loaded from a versioned local calendar sourced from official NSE notices.

**Tech Stack:** FastAPI REST, standard-library SQLite/JSON, React 18, Vitest, pytest, APScheduler, existing Oracle VM/systemd deployment.

## Global Constraints

- Analytics describe signal outcomes, not assumed personal trades or P&L.
- Label any selected segment with fewer than 100 completed observations as `Insufficient sample`.
- Default score bands are 75–79, 80–84, 85–89, and 90–100.
- Keep historical analytics off the live WebSocket.
- Retain the latest 30 daily database backups.
- Rate-limit login attempts without logging submitted credentials.
- Use official NSE Capital Market notices as the source for session exceptions.
- Run five varied replays and one full live shadow session before enabling production alerts.

## File Structure

- `backend/app/analytics/models.py` — query and response contracts.
- `backend/app/analytics/service.py` — grouped outcome calculations.
- `backend/app/settings.py` — validated server-authoritative runtime settings.
- `backend/app/market/calendar.py` — IST session and holiday decisions.
- `backend/app/market/calendars/nse-cm-2026.json` — versioned official session exceptions.
- `backend/app/storage/backup.py` — online SQLite backup and retention.
- `frontend/src/pages/Analytics.jsx` — outcome analysis.
- `frontend/src/pages/Settings.jsx` — server and client preferences.
- `docs/operations/decision-engine-runbook.md` — deployment, backup, and incident procedures.
- `docs/validation/decision-engine-acceptance.md` — replay/shadow evidence.

---

### Task 1: Implement paginated signal analytics

**Files:**
- Create: `backend/app/analytics/__init__.py`
- Create: `backend/app/analytics/models.py`
- Create: `backend/app/analytics/service.py`
- Create: `backend/tests/test_analytics.py`
- Modify: `backend/app/storage/repository.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Consumes: persisted `signals` and `signal_outcomes`.
- Produces:
  - `GET /api/signals?cursor=&limit=&filters...`
  - `GET /api/analytics/summary?from=&to=&direction=&family=&sector=&mode=&score_band=`
  - `AnalyticsService.summary(filters) -> AnalyticsSummary`.
  - `summarize_outcomes(rows: list[dict]) -> AnalyticsSummary`.

- [ ] **Step 1: Write failing analytics tests**

```python
# backend/tests/test_analytics.py
from app.analytics.service import (
    decode_cursor,
    encode_cursor,
    filter_rows,
    score_band,
    summarize_outcomes,
)


def test_summary_groups_paths_and_flags_small_samples():
    rows = [
        {
            "path": "stop_before_t1",
            "time_to_trigger_seconds": 30,
            "mfe_r": 0.2,
            "mae_r": -1.0,
        }
        for _ in range(20)
    ]
    summary = summarize_outcomes(rows)
    assert summary.completed == 20
    assert summary.paths["stop_before_t1"] == 20
    assert summary.sample_status == "insufficient"
    assert summary.minimum_sample == 100


def test_score_bands_have_approved_edges():
    assert score_band(75) == "75-79"
    assert score_band(80) == "80-84"
    assert score_band(85) == "85-89"
    assert score_band(90) == "90-100"


def test_filters_compose_across_persisted_dimensions():
    rows = [
        {
            "setup_id": "keep",
            "triggered_at": "2026-07-29T10:00:00+05:30",
            "direction": "short",
            "family": "orb",
            "sector": "IT",
            "mode": "opening",
            "score": 86,
        },
        {
            "setup_id": "drop",
            "triggered_at": "2026-07-28T13:00:00+05:30",
            "direction": "long",
            "family": "vwap",
            "sector": "Energy",
            "mode": "intraday",
            "score": 78,
        },
    ]
    filters = {
        "from": "2026-07-29",
        "to": "2026-07-29",
        "direction": "short",
        "family": "orb",
        "sector": "IT",
        "mode": "opening",
        "score_band": "85-89",
    }
    assert [row["setup_id"] for row in filter_rows(rows, filters)] == ["keep"]


def test_signal_cursor_round_trips_without_exposing_sql_offsets():
    cursor = encode_cursor("2026-07-29T10:00:00+05:30", "setup-123")
    assert decode_cursor(cursor) == (
        "2026-07-29T10:00:00+05:30",
        "setup-123",
    )
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_analytics.py -q`

Expected: FAIL because analytics modules and routes do not exist.

- [ ] **Step 3: Implement grouped queries and response contracts**

```python
# backend/app/analytics/models.py
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class AnalyticsSummary:
    completed: int
    paths: dict[str, int]
    path_percentages: dict[str, float]
    median_time_to_trigger_seconds: float | None
    median_time_to_t1_seconds: float | None
    median_time_to_t2_seconds: float | None
    median_mfe_r: float | None
    p90_mfe_r: float | None
    median_mae_r: float | None
    p90_mae_r: float | None
    follow_through_rate: float | None
    false_breakout_rate: float | None
    breakdowns: dict[str, dict[str, int]]
    sample_status: str
    minimum_sample: int = 100
```

```python
# backend/app/analytics/service.py
from app.analytics.models import AnalyticsSummary


SCORE_BANDS = ((75, 79), (80, 84), (85, 89), (90, 100))


def score_band(score: float) -> str | None:
    for low, high in SCORE_BANDS:
        if low <= score <= high:
            return f"{low}-{high}"
    return None


def sample_status(count: int) -> str:
    return "sufficient" if count >= 100 else "insufficient"
```

Repository queries must use bound parameters and indexed relational fields.
Parse JSON snapshots only after pagination. Return counts, path percentages,
median time-to-trigger/T1/T2, median and percentile MFE/MAE, follow-through
rate, false-breakout rate, and `minimum_sample=100`. Return `null`, not zero,
for a statistic with no valid observations.

Use opaque cursor values encoded from `(triggered_at, setup_id)` and cap `limit`
at 100.

- [ ] **Step 4: Run analytics and API tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_analytics.py tests/test_lifecycle.py tests/test_outcomes.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/analytics backend/app/storage/repository.py backend/app/main.py backend/tests/test_analytics.py
git commit -m "feat: expose sample-aware signal analytics"
```

### Task 2: Build the Analytics view

**Files:**
- Create: `frontend/src/pages/Analytics.jsx`
- Create: `frontend/src/components/analytics/AnalyticsFilters.jsx`
- Create: `frontend/src/components/analytics/OutcomeSummary.jsx`
- Create: `frontend/src/components/analytics/DistributionChart.jsx`
- Create: `frontend/src/components/analytics/SignalHistory.jsx`
- Create: `frontend/src/components/analytics/Analytics.test.jsx`
- Modify: `frontend/src/app/AppShell.jsx`

**Interfaces:**
- Consumes: analytics REST responses and paginated signal history.
- Produces: filterable outcome analysis with explicit sample-quality state.

- [ ] **Step 1: Write failing analytics UI tests**

```javascript
// frontend/src/components/analytics/Analytics.test.jsx
import { afterEach, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { select } from "../../test/storeHarness.jsx";
import Analytics from "../../pages/Analytics.jsx";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => vi.unstubAllGlobals());

const mockSummary = (body) => {
  fetch.mockResolvedValue({
    ok: true,
    json: async () => body,
  });
};


it("does not display a small sample as a calibrated rate", async () => {
  mockSummary({ completed: 42, sample_status: "insufficient", false_breakout_rate: 0.31 });
  render(<Analytics />);
  expect(await screen.findByText("Insufficient sample")).toBeInTheDocument();
  expect(screen.queryByText("31% win probability")).not.toBeInTheDocument();
});

it("applies filters to the REST request", async () => {
  mockSummary({ completed: 0, sample_status: "insufficient" });
  render(<Analytics />);
  select("Setup", "ORB");
  select("Direction", "Short");
  await waitFor(() => {
    const url = fetch.mock.calls.at(-1)[0];
    expect(url).toContain("family=orb");
    expect(url).toContain("direction=short");
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd frontend; npm test -- Analytics.test.jsx`

Expected: FAIL because analytics components do not exist.

- [ ] **Step 3: Implement analysis without decorative metrics**

Render:

- Completed signals and sample status.
- Outcome-path distribution.
- MFE/MAE distribution.
- Time-to-trigger and time-to-target distribution.
- Follow-through and false-breakout rates.
- Breakdown by score band, setup, direction, sector, and session mode.
- Paginated signal history that opens the frozen Setup Inspector detail.

Use SVG bars/lines with accessible table equivalents. Do not show a percentage
when the denominator is zero. Place the sample-warning banner above all rates
when `sample_status === "insufficient"`.

- [ ] **Step 4: Run analytics UI tests and build**

Run: `cd frontend; npm test -- Analytics.test.jsx`

Run: `cd frontend; npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Analytics.jsx frontend/src/components/analytics frontend/src/app/AppShell.jsx
git commit -m "feat: add signal outcome analytics"
```

### Task 3: Persist validated runtime settings

**Files:**
- Modify: `backend/app/storage/migrations.py`
- Create: `backend/app/settings.py`
- Create: `backend/tests/test_settings.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/decision/evaluator.py`
- Create: `frontend/src/pages/Settings.jsx`
- Create: `frontend/src/pages/Settings.test.jsx`
- Modify: `frontend/src/app/AppShell.jsx`

**Interfaces:**
- Consumes: authenticated admin REST requests.
- Produces:
  - `GET /api/settings`
  - `PUT /api/settings`
  - `SettingsService(repository).load() -> RuntimeSettings`
  - `SettingsService(repository).update(values) -> RuntimeSettings`
  - `RuntimeSettings(arm_score=75, consecutive_cycles=3, alert_cutoff="15:00", minimum_room_r=1.5, shadow_mode=True)`.

- [ ] **Step 1: Write failing backend validation tests**

```python
# backend/tests/test_settings.py
import pytest
from pydantic import ValidationError

from app.settings import RuntimeSettings, SettingsService
from app.storage.database import Database
from app.storage.repository import MarketRepository


@pytest.fixture
def settings_factory(tmp_path):
    database = Database(str(tmp_path / "settings.db"))
    database.migrate()
    repository = MarketRepository(database)
    return lambda: SettingsService(repository)


def test_settings_reject_unsafe_ranges():
    with pytest.raises(ValidationError):
        RuntimeSettings(arm_score=101)


def test_settings_persist_across_service_instances(settings_factory):
    first = settings_factory()
    first.update(RuntimeSettings(arm_score=80).model_dump(mode="json"))
    assert settings_factory().load().arm_score == 80
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_settings.py -q`

Expected: FAIL because persisted settings do not exist.

- [ ] **Step 3: Add migration 4, validation, and REST**

```sql
CREATE TABLE runtime_settings (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    settings_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

```python
from datetime import time

from pydantic import BaseModel, Field


class RuntimeSettings(BaseModel):
    arm_score: int = Field(75, ge=50, le=100)
    consecutive_cycles: int = Field(3, ge=1, le=12)
    alert_cutoff: time = time(15, 0)
    minimum_room_r: float = Field(1.5, ge=1.0, le=5.0)
    shadow_mode: bool = True
```

`PUT` replaces the complete validated settings document transactionally. The
evaluator reads one immutable settings snapshot per evaluation; it must not
read SQLite per symbol.

- [ ] **Step 4: Build and test the Settings view**

The Settings page edits the five server-authoritative values above. Sound,
browser notifications, compact density, scanner columns, and saved views stay
in versioned local storage.

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_settings.py -q`

Run: `cd frontend; npm test -- Settings.test.jsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage/migrations.py backend/app/settings.py backend/app/main.py backend/app/decision/evaluator.py backend/tests/test_settings.py frontend/src/pages/Settings.jsx frontend/src/pages/Settings.test.jsx frontend/src/app/AppShell.jsx
git commit -m "feat: persist decision engine settings"
```

### Task 4: Enforce the NSE session calendar and login safeguards

**Files:**
- Create: `backend/app/market/calendar.py`
- Create: `backend/app/market/calendars/nse-cm-2026.json`
- Create: `backend/tests/test_calendar.py`
- Create: `backend/app/login_limiter.py`
- Create: `backend/tests/test_login_limiter.py`
- Modify: `backend/app/scheduler.py:23-30,90-110`
- Modify: `backend/app/main.py:74-116`
- Modify: `backend/app/config.py`
- Modify: `deploy/README.md`

**Interfaces:**
- Consumes: versioned calendar JSON and request client IP.
- Produces:
  - `SessionCalendar.session_for(day: date) -> TradingSession | None`
  - `LoginLimiter.allow(key: str, now: datetime) -> bool`.

- [ ] **Step 1: Write failing calendar and limiter tests**

```python
# backend/tests/test_calendar.py
from datetime import date
from pathlib import Path

import pytest

from app.market.calendar import SessionCalendar


@pytest.fixture
def calendar():
    path = Path(__file__).parents[1] / "app/market/calendars/nse-cm-2026.json"
    return SessionCalendar.from_file(path)


def test_2026_capital_market_holidays(calendar):
    assert calendar.session_for(date(2026, 1, 15)) is None
    assert calendar.session_for(date(2026, 1, 26)) is None
    assert calendar.session_for(date(2026, 7, 29)).opens_at.isoformat() == "09:15:00"


def test_unconfigured_special_session_is_closed(calendar):
    assert calendar.session_for(date(2026, 11, 8)) is None
```

```python
# backend/tests/test_login_limiter.py
from datetime import timedelta

import pytest

from app.login_limiter import LoginLimiter


@pytest.fixture
def limiter():
    return LoginLimiter(max_failures=5, window=timedelta(minutes=15))


def test_sixth_failed_login_is_blocked_for_window(limiter, clock):
    for _ in range(5):
        assert limiter.allow("127.0.0.1", clock.now())
        limiter.record_failure("127.0.0.1", clock.now())
    assert not limiter.allow("127.0.0.1", clock.now())
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_calendar.py tests/test_login_limiter.py -q`

Expected: FAIL because calendar and limiter modules do not exist.

- [ ] **Step 3: Add the versioned 2026 Capital Market calendar**

Create JSON with regular hours `09:15–15:30`, the additional January 15 closure
from NSE/CMTR/72260, and the 15 closures from NSE/CMTR/71775:

```json
{
  "segment": "NSE Capital Market",
  "year": 2026,
  "regular_session": {"open": "09:15", "close": "15:30"},
  "closed_dates": [
    "2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26",
    "2026-03-31", "2026-04-03", "2026-04-14", "2026-05-01",
    "2026-05-28", "2026-06-26", "2026-09-14", "2026-10-02",
    "2026-10-20", "2026-11-10", "2026-11-24", "2026-12-25"
  ],
  "special_sessions": {},
  "sources": [
    "https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf",
    "https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf",
    "https://www.nseindia.com/resources/exchange-communication-holidays"
  ]
}
```

November 8 is a Sunday with Muhurat Trading announced but its exact session
must remain closed in this application until the official timing is entered in
`special_sessions`. Fail closed when the calendar year is missing.

Implement the returned session contract explicitly:

```python
# backend/app/market/calendar.py
from dataclasses import dataclass
from datetime import date, time


@dataclass(frozen=True, slots=True)
class TradingSession:
    day: date
    opens_at: time
    closes_at: time
    special: bool
```

- [ ] **Step 4: Implement rate limiting and secure cookie configuration**

Keep a bounded in-memory deque of failed timestamps per client key. Permit five
failures per 15 minutes; return HTTP 429 with `Retry-After` on further attempts.
Clear the key after a successful login. Never log usernames or passwords.

Add `SESSION_HTTPS_ONLY` and pass `https_only=config.SESSION_HTTPS_ONLY` to
`SessionMiddleware`. Deployment documentation must set it to `true`; local
development defaults to `false`.

Replace weekday-only scheduler checks with `SessionCalendar`. Cron may still
wake on weekdays, but engine start must consult the calendar.

- [ ] **Step 5: Run security and calendar tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_calendar.py tests/test_login_limiter.py tests/test_health.py -q`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/market/calendar.py backend/app/market/calendars backend/app/login_limiter.py backend/app/scheduler.py backend/app/main.py backend/app/config.py backend/tests/test_calendar.py backend/tests/test_login_limiter.py deploy/README.md
git commit -m "feat: enforce exchange sessions and login limits"
```

### Task 5: Add online backups and the operations runbook

**Files:**
- Create: `backend/app/storage/backup.py`
- Create: `backend/tests/test_backup.py`
- Modify: `backend/app/scheduler.py`
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`
- Modify: `Dockerfile`
- Modify: `deploy/tradedash.service`
- Create: `docs/operations/decision-engine-runbook.md`

**Interfaces:**
- Consumes: active SQLite path and backup directory.
- Produces: `backup_database(source, destination_dir, keep=30) -> Path`.

- [ ] **Step 1: Write the failing backup test**

```python
# backend/tests/test_backup.py
from datetime import date, timedelta

import pytest

from app.storage.backup import backup_database
from app.storage.database import Database


def make_old_backup(root, index):
    day = date(2026, 1, 1) + timedelta(days=index)
    path = root / f"market-{day:%Y%m%d}.db"
    path.write_bytes(b"old")


@pytest.fixture
def seeded_database(tmp_path):
    path = tmp_path / "market.db"
    Database(str(path)).migrate()
    return path


def test_backup_is_consistent_and_retains_thirty(tmp_path, seeded_database):
    backup = backup_database(seeded_database, tmp_path / "backups", keep=30)
    assert backup.exists()
    for index in range(35):
        make_old_backup(tmp_path / "backups", index)
    backup_database(seeded_database, tmp_path / "backups", keep=30)
    assert len(list((tmp_path / "backups").glob("market-*.db"))) == 30
```

- [ ] **Step 2: Run test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_backup.py -q`

Expected: FAIL because backup support does not exist.

- [ ] **Step 3: Implement SQLite online backup**

```python
def backup_database(source_path, destination_dir, keep=30, now=None):
    now = now or datetime.now(IST)
    destination_dir = Path(destination_dir)
    destination_dir.mkdir(parents=True, exist_ok=True)
    target = destination_dir / f"market-{now:%Y%m%d}.db"
    with sqlite3.connect(source_path) as source, sqlite3.connect(target) as dest:
        source.backup(dest)
    backups = sorted(destination_dir.glob("market-*.db"), reverse=True)
    for stale in backups[keep:]:
        stale.unlink()
    return target
```

Schedule backup at 16:00 IST after normal close. Add `BACKUP_DIR=/data/backups`
and ensure Docker/systemd deployment grants write access to `/data`. The
runbook must include restore validation, database-degraded response, FYERS
disconnect response, WebSocket troubleshooting, calendar update procedure,
and rollback steps.

- [ ] **Step 4: Run backup tests and container build**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_backup.py -q`

Run: `docker build -t tradedashboard-plan4-check .`

Expected: test PASS and image build succeeds.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage/backup.py backend/app/scheduler.py backend/app/config.py backend/.env.example backend/tests/test_backup.py Dockerfile deploy/tradedash.service docs/operations/decision-engine-runbook.md
git commit -m "ops: add decision database backups"
```

### Task 6: Prove replay, load, restart, and shadow-mode acceptance

**Files:**
- Create: `backend/tests/fixtures/replay/trend_day.jsonl`
- Create: `backend/tests/fixtures/replay/range_day.jsonl`
- Create: `backend/tests/fixtures/replay/gap_day.jsonl`
- Create: `backend/tests/fixtures/replay/reversal_day.jsonl`
- Create: `backend/tests/test_acceptance_replays.py`
- Create: `backend/tests/load_harness.py`
- Create: `backend/tests/test_load_profile.py`
- Create: `frontend/src/performance/renderIsolation.test.jsx`
- Create: `docs/validation/decision-engine-acceptance.md`

**Interfaces:**
- Consumes: complete application, injected clocks, recorded normalized fixtures.
- Produces:
  - `LoadHarness.run(symbols: int, clients: int, seconds: int) -> LoadResult`
  - reproducible acceptance evidence and measured performance results.

- [ ] **Step 1: Add five varied deterministic replay assertions**

```python
# backend/tests/test_acceptance_replays.py
from pathlib import Path

import pytest

from app.replay import run_replay


FIXTURES = Path(__file__).parent / "fixtures/replay"


@pytest.mark.parametrize("fixture_name", [
    "opening_session.jsonl",
    "trend_day.jsonl",
    "range_day.jsonl",
    "gap_day.jsonl",
    "reversal_day.jsonl",
])
def test_session_replay_is_deterministic_and_duplicate_free(fixture_name):
    first = run_replay(FIXTURES / fixture_name)
    second = run_replay(FIXTURES / fixture_name)
    assert first == second
    event_ids = [event["event_id"] for event in first["events"]]
    assert len(event_ids) == len(set(event_ids))
    assert all(event["fresh"] for event in first["triggered_events"])
```

- [ ] **Step 2: Add a 169-symbol/ten-client load test**

```python
# backend/tests/test_load_profile.py
import pytest

from tests.load_harness import LoadHarness


@pytest.fixture
def load_harness():
    return LoadHarness()


@pytest.mark.slow
def test_broadcaster_builds_once_for_ten_clients(load_harness):
    result = load_harness.run(symbols=169, clients=10, seconds=60)
    assert result.frame_builds <= 245
    assert result.max_queue_depth <= 8
    assert result.p50_tick_to_frame_ms <= 300
    assert result.max_evaluation_ms <= 1000
```

Use an in-process synthetic tick source and monotonic timestamps. Mark the test
`slow` so the default suite may skip it, but the acceptance command must run it.
`LoadHarness` must subscribe ten queues to one `Broadcaster`, publish a
deterministic round-robin tick for each of 169 symbols every 250 ms, count calls
to the injected snapshot builder, record queue depths, measure
tick-to-serialized-frame latency with `time.perf_counter_ns()`, and time every
five-second evaluator call. Return those values through:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class LoadResult:
    frame_builds: int
    max_queue_depth: int
    p50_tick_to_frame_ms: float
    max_evaluation_ms: float
```

- [ ] **Step 3: Add frontend render-isolation assertions**

```javascript
// frontend/src/performance/renderIsolation.test.jsx
import { useSyncExternalStore } from "react";
import { act, render } from "@testing-library/react";
import { marketStore } from "../api/marketStore.js";

function InstrumentedRow({ symbol, renders }) {
  useSyncExternalStore(
    (listener) => marketStore.subscribeStock(symbol, listener),
    () => marketStore.getStock(symbol),
  );
  renders[symbol] += 1;
  return null;
}

function InstrumentedRows({ renders }) {
  return (
    <>
      <InstrumentedRow symbol="TCS" renders={renders} />
      <InstrumentedRow symbol="INFY" renders={renders} />
    </>
  );
}


it("does not rerender INFY when only TCS changes", () => {
  const renders = { TCS: 0, INFY: 0 };
  marketStore.seedForTest({
    stocks: [{ symbol: "TCS", ltp: 100 }, { symbol: "INFY", ltp: 200 }],
    seq: 1,
  });
  render(<InstrumentedRows renders={renders} />);
  act(() => marketStore.applyFrame({
    type: "delta", seq: 2, stocks: [{ symbol: "TCS", ltp: 101 }],
  }));
  expect(renders.TCS).toBe(2);
  expect(renders.INFY).toBe(1);
});
```

- [ ] **Step 4: Run the production acceptance commands**

Run:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests -m "not slow" -q
.\.venv\Scripts\python.exe -m pytest tests/test_load_profile.py -m slow -q
```

Run:

```powershell
cd frontend
npm test
npm run build
```

Expected:

- Median synthetic tick-to-frame latency ≤300 ms.
- Each evaluation completes ≤1 second.
- Ten clients do not multiply frame construction.
- No stale or duplicate trigger event appears.
- Unrelated stock rows do not rerender.

- [ ] **Step 5: Complete one live shadow session**

Set `SHADOW_MODE=true`, run from before 09:15 through after 15:30, and record:

- Backfill coverage and time.
- Feed gaps and automatic recovery.
- 11:15 mode transition.
- Candidate/armed/triggered counts.
- Duplicate-event count.
- Database and backup health.
- Browser reconnect behavior.

Enter measured values and pass/fail evidence in
`docs/validation/decision-engine-acceptance.md`. Production alert delivery may
be enabled only when every acceptance criterion passes.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/fixtures/replay backend/tests/load_harness.py backend/tests/test_acceptance_replays.py backend/tests/test_load_profile.py frontend/src/performance/renderIsolation.test.jsx docs/validation/decision-engine-acceptance.md
git commit -m "test: validate decision engine production readiness"
```

## Plan 4 Completion Gate

The program is complete only when:

- Analytics reconciles with lifecycle/outcome rows.
- Small samples are visibly labelled and never presented as probabilities.
- Runtime settings persist and are validated.
- NSE holidays and special sessions fail closed.
- Login limiting and secure production cookies are active.
- Thirty recoverable daily backups are retained.
- Five replays, the ten-client load test, frontend render test, production
  build, and one full live shadow session all pass.
