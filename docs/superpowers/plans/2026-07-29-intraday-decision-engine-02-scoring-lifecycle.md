# Scoring and Signal Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce explainable opening/intraday rankings, deterministic trade frameworks, auditable alerts, and recorded signal outcomes from the market-data foundation.

**Architecture:** Immutable market snapshots flow through pure feature, setup, scoring, eligibility, and trade-planning functions. A stateful evaluator runs every five seconds, while a lifecycle service owns transitions and transactional persistence. Outcome tracking consumes later candles without mutating the frozen setup plan.

**Tech Stack:** Python dataclasses and enums, standard-library statistics/math, pytest, SQLite repositories created in Plan 1.

## Global Constraints

- Implement exactly four setup families: ORB continuation/failure, VWAP reclaim/rejection, relative-strength trend continuation, and day-high/day-low breakout.
- Evaluate every five seconds.
- Use the approved opening and intraday weight tables.
- Arm only after score ≥75 for three consecutive evaluations.
- Keep top ten long and top ten short candidates.
- Do not describe a score as a win probability.
- Use deterministic, mirrored long/short calculations.
- Freeze trigger, stop, targets, evidence, and score when triggered.
- Never emit the same setup identity more than once.

## File Structure

- `backend/app/decision/models.py` — enums and immutable decision contracts.
- `backend/app/decision/features.py` — feature derivation.
- `backend/app/decision/context.py` — NIFTY and sector context.
- `backend/app/decision/setups.py` — four pure setup detectors.
- `backend/app/decision/scoring.py` — mode profiles and score smoothing.
- `backend/app/decision/ranking.py` — stable top-ten ranking.
- `backend/app/decision/trade_plan.py` — gates, trigger, stop, T1, and T2.
- `backend/app/decision/lifecycle.py` — transition rules and alert deduplication.
- `backend/app/decision/outcomes.py` — MFE/MAE and terminal outcomes.
- `backend/app/decision/evaluator.py` — five-second orchestration.
- `backend/app/storage/repository.py` — signal/event/outcome persistence.

---

### Task 1: Define immutable decision contracts

**Files:**
- Create: `backend/app/decision/__init__.py`
- Create: `backend/app/decision/models.py`
- Create: `backend/tests/factories.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_decision_models.py`

**Interfaces:**
- Consumes: `datetime`, stock/market snapshots from Plan 1.
- Produces: `Direction`, `SessionMode`, `SetupFamily`, `LifecycleState`,
  `FeatureSnapshot`, `SetupCandidate`, `ScoreBreakdown`, `TradePlan`,
  `TradePlanResult`, `SignalRecord`, `SignalEvent`, `LifecycleResult`, and
  `RankedOpportunity`, `MarketContext`, `SectorContext`, `RankedLists`,
  `SignalOutcome`, and `DecisionSnapshot`.

- [ ] **Step 1: Write the failing identity test**

```python
# backend/tests/test_decision_models.py
from datetime import datetime

from app.config import IST
from app.decision.models import Direction, SessionMode, SetupCandidate, SetupFamily


def test_setup_identity_is_stable_and_boundary_sensitive():
    at = IST.localize(datetime(2026, 7, 29, 9, 45))
    base = SetupCandidate(
        symbol="TCS",
        sector="IT",
        direction=Direction.LONG,
        family=SetupFamily.ORB,
        mode=SessionMode.OPENING,
        detected_at=at,
        anchor_at=at,
        boundary=3200.0,
        invalidation=3175.0,
        structure_quality=80.0,
        evidence=("above C1 high",),
        warnings=(),
    )
    assert base.setup_id == SetupCandidate(**{**base.as_dict(), "boundary": 3200.0}).setup_id
    assert base.setup_id != SetupCandidate(**{**base.as_dict(), "boundary": 3201.0}).setup_id
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_decision_models.py -q`

Expected: FAIL because the decision package does not exist.

- [ ] **Step 3: Implement enums and frozen dataclasses**

```python
# backend/app/decision/models.py
from dataclasses import asdict, dataclass
from datetime import datetime
from enum import StrEnum
from hashlib import sha256


class Direction(StrEnum):
    LONG = "long"
    SHORT = "short"


class SessionMode(StrEnum):
    OPENING = "opening"
    INTRADAY = "intraday"


class SetupFamily(StrEnum):
    ORB = "orb"
    VWAP = "vwap"
    RELATIVE_STRENGTH = "relative_strength"
    DAY_EXTREME = "day_extreme"


class LifecycleState(StrEnum):
    WATCHING = "watching"
    ARMED = "armed"
    TRIGGERED = "triggered"
    ACTIVE = "active"
    COMPLETED = "completed"
    INVALIDATED = "invalidated"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class SetupCandidate:
    symbol: str
    sector: str
    direction: Direction
    family: SetupFamily
    mode: SessionMode
    detected_at: datetime
    anchor_at: datetime
    boundary: float
    invalidation: float
    structure_quality: float
    evidence: tuple[str, ...]
    warnings: tuple[str, ...]

    @property
    def setup_id(self) -> str:
        key = "|".join((
            self.symbol, self.direction, self.family, self.anchor_at.isoformat(),
            f"{self.boundary:.4f}",
        ))
        return sha256(key.encode()).hexdigest()[:24]

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class FeatureSnapshot:
    symbol: str
    sector: str
    at: datetime
    latest_1m_at: datetime
    latest_5m_at: datetime
    latest_5m_close: float
    orb_anchor_at: datetime | None
    ltp: float
    pct_change: float
    atr5: float | None
    vwap: float | None
    relative_strength: float | None
    rs_persistence: float | None
    relative_volume: float | None
    volume_acceleration: float | None
    vwap_persistence: float | None
    trend_1m: float | None
    trend_5m: float | None
    orb_high: float | None
    orb_low: float | None
    day_high: float | None
    day_low: float | None
    sector_strength: float | None
    sector_breadth: float | None
    market_strength: float | None
    market_breadth: float | None
    feed_age_seconds: float
    symbol_age_seconds: float
    history_sessions: int


@dataclass(frozen=True, slots=True)
class ScoreBreakdown:
    setup_id: str
    raw_score: float | None
    display_score: float | None
    components: dict[str, float | None]
    complete: bool
    missing: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class TradePlan:
    trigger: float
    stop: float
    t1: float
    t2: float
    risk: float
    structural_room_r: float


@dataclass(frozen=True, slots=True)
class TradePlanResult:
    plan: TradePlan | None
    blockers: tuple[str, ...]
    warnings: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class SignalEvent:
    event_id: str
    setup_id: str
    event_type: str
    occurred_at: datetime
    payload: dict


@dataclass(frozen=True, slots=True)
class SignalRecord:
    setup_id: str
    state: LifecycleState
    candidate: SetupCandidate
    features: FeatureSnapshot
    score: ScoreBreakdown
    plan: TradePlan | None
    consecutive_eligible: int
    detected_at: datetime
    armed_at: datetime | None
    triggered_at: datetime | None
    completed_at: datetime | None


@dataclass(frozen=True, slots=True)
class LifecycleResult:
    record: SignalRecord
    events: tuple[SignalEvent, ...]


@dataclass(frozen=True, slots=True)
class RankedOpportunity:
    candidate: SetupCandidate
    score: ScoreBreakdown
    plan: TradePlan | None
    blockers: tuple[str, ...]
    state: LifecycleState
    rank: int
    rank_delta: int


@dataclass(frozen=True, slots=True)
class MarketContext:
    at: datetime
    strength: float | None
    breadth: float | None
    complete: bool


@dataclass(frozen=True, slots=True)
class SectorContext:
    sector: str
    strength: float | None
    breadth: float | None
    coverage: float
    complete: bool


@dataclass(frozen=True, slots=True)
class RankedLists:
    long: tuple[RankedOpportunity, ...]
    short: tuple[RankedOpportunity, ...]


@dataclass(frozen=True, slots=True)
class SignalOutcome:
    setup_id: str
    path: str
    t1_at: datetime | None
    t2_at: datetime | None
    stop_at: datetime | None
    mfe_r: float
    mae_r: float
    follow_through: bool
    false_breakout: bool
    end_state: str


@dataclass(frozen=True, slots=True)
class DecisionSnapshot:
    seq: int
    at: datetime
    mode: SessionMode
    market: MarketContext
    sectors: dict[str, SectorContext]
    all_opportunities: tuple[RankedOpportunity, ...]
    opportunities: RankedLists
    events: tuple[SignalEvent, ...]
    blockers: tuple[str, ...]
```

`ScoreBreakdown.components` must always contain the canonical keys
`structure`, `relative_strength`, `relative_volume`, `vwap`, `sector`,
`market`, and `trade_quality`, using `None` when unavailable.

Add shared test factories:

```python
# backend/tests/factories.py
from dataclasses import replace
from datetime import datetime

from app.config import IST
from app.decision.models import (
    Direction, FeatureSnapshot, SessionMode, SetupCandidate, SetupFamily,
)


BASE_AT = IST.localize(datetime(2026, 7, 29, 10, 0))


class FakeClock:
    def __init__(self, value=BASE_AT):
        self.value = value

    def now(self):
        return self.value

    def set(self, iso_value):
        self.value = datetime.fromisoformat(iso_value)


def make_feature(**overrides):
    base = FeatureSnapshot(
        symbol="TCS", sector="IT", at=BASE_AT,
        latest_1m_at=BASE_AT, latest_5m_at=BASE_AT, latest_5m_close=100.0,
        orb_anchor_at=BASE_AT,
        ltp=100.0, pct_change=1.0,
        atr5=2.0, vwap=99.0, relative_strength=1.0, rs_persistence=0.8,
        relative_volume=1.5, volume_acceleration=0.5, vwap_persistence=0.8,
        trend_1m=1, trend_5m=1, orb_high=99.5, orb_low=97.0,
        day_high=101.0, day_low=96.0, sector_strength=0.8,
        sector_breadth=0.4, market_strength=0.5, market_breadth=0.2,
        feed_age_seconds=1.0, symbol_age_seconds=1.0, history_sessions=20,
    )
    return replace(base, **overrides)


def make_candidate(**overrides):
    feature = make_feature()
    base = SetupCandidate(
        symbol=feature.symbol, sector=feature.sector, direction=Direction.LONG,
        family=SetupFamily.ORB, mode=SessionMode.OPENING,
        detected_at=feature.at, anchor_at=feature.at, boundary=100.0,
        invalidation=98.0, structure_quality=80.0,
        evidence=("Confirmed structure",), warnings=(),
    )
    return replace(base, **overrides)
```

```python
# backend/tests/conftest.py
import pytest

from tests.factories import make_candidate, make_feature


@pytest.fixture
def feature_factory():
    return make_feature


@pytest.fixture
def candidate():
    return make_candidate()


@pytest.fixture
def feature():
    return make_feature()


@pytest.fixture
def clock():
    from tests.factories import FakeClock
    return FakeClock()
```

- [ ] **Step 4: Run the model tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_decision_models.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision backend/tests/factories.py backend/tests/conftest.py backend/tests/test_decision_models.py
git commit -m "feat: define decision engine contracts"
```

### Task 2: Calculate stock, market, and sector features

**Files:**
- Create: `backend/app/decision/features.py`
- Create: `backend/app/decision/context.py`
- Create: `backend/tests/test_features.py`
- Create: `backend/tests/test_context.py`

**Interfaces:**
- Consumes: immutable market snapshot, current/recent one- and five-minute candles, `VolumeBaseline`.
- Produces:
  - `build_feature_snapshot(symbol, market, candles, baseline) -> FeatureSnapshot`
  - `build_market_context(market) -> MarketContext`
  - `build_sector_context(market) -> dict[str, SectorContext]`

- [ ] **Step 1: Write failing feature tests**

```python
# backend/tests/test_features.py
from app.decision.features import atr, persistence, relative_volume


def test_atr_uses_true_range():
    candles = [
        {"high": 105, "low": 99, "close": 100},
        {"high": 107, "low": 101, "close": 106},
    ]
    assert atr(candles, period=2) == 7.0


def test_persistence_is_fraction_on_expected_side():
    assert persistence([1, 2, -1, 3], lambda value: value > 0) == 0.75


def test_relative_volume_is_unavailable_without_baseline():
    assert relative_volume(1200, None) is None
    assert relative_volume(1200, 800) == 1.5
```

```python
# backend/tests/test_context.py
from app.decision.context import breadth


def test_breadth_ignores_stale_constituents():
    rows = [
        {"pct_change": 1.0, "fresh": True},
        {"pct_change": -0.5, "fresh": True},
        {"pct_change": 2.0, "fresh": False},
    ]
    assert breadth(rows) == 0.0
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_features.py tests/test_context.py -q`

Expected: FAIL because feature/context functions do not exist.

- [ ] **Step 3: Implement pure calculations**

```python
# backend/app/decision/features.py
def true_range(current: dict, previous_close: float) -> float:
    return max(
        current["high"] - current["low"],
        abs(current["high"] - previous_close),
        abs(current["low"] - previous_close),
    )


def atr(candles: list[dict], period: int = 14) -> float | None:
    if len(candles) < 2:
        return None
    rows = candles[-period:]
    values = [
        true_range(row, candles[candles.index(row) - 1]["close"])
        for row in rows
        if candles.index(row) > 0
    ]
    return round(sum(values) / len(values), 4) if values else None


def persistence(values: list[float], predicate) -> float | None:
    return round(sum(bool(predicate(v)) for v in values) / len(values), 4) if values else None


def relative_volume(actual: int, expected: int | None) -> float | None:
    return round(actual / expected, 4) if expected else None
```

Implement `atr` using index iteration rather than `list.index` in final code so
duplicate candle dictionaries remain correct. Normalize distances by ATR,
calculate VWAP-side persistence from recent one-minute closes, and use the
existing NIFTY percentage change for relative strength.

`FeatureSnapshot.day_high` and `day_low` are confirmed rolling boundaries built
from completed one-minute candles before the newest completed detector candle.
They are not the live FYERS day extrema, which may already include the breakout
candle.

In `context.py`, calculate fresh-only watchlist breadth, sector breadth,
sector-average relative strength, and NIFTY trend. A sector context is
`complete=False` when fewer than 70% of its mapped constituents are fresh.

- [ ] **Step 4: Run focused tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_features.py tests/test_context.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision/features.py backend/app/decision/context.py backend/tests/test_features.py backend/tests/test_context.py
git commit -m "feat: calculate explainable market features"
```

### Task 3: Detect the four setup families

**Files:**
- Create: `backend/app/decision/setups.py`
- Create: `backend/tests/test_setups.py`

**Interfaces:**
- Consumes: `FeatureSnapshot`, latest candles, session mode, ORB bounds.
- Produces: `detect_setups(...) -> tuple[SetupCandidate, ...]`.

- [ ] **Step 1: Write failing mirrored detector tests**

```python
# backend/tests/test_setups.py
from types import SimpleNamespace

from app.decision.models import Direction, SetupFamily
from app.decision.setups import (
    detect_day_extreme,
    detect_orb,
    detect_relative_strength,
    detect_vwap,
)


def test_orb_detector_emits_long_and_short_symmetrically(feature_factory):
    long = detect_orb(feature_factory(ltp=101, orb_high=100, orb_low=95))[0]
    short = detect_orb(feature_factory(ltp=94, orb_high=100, orb_low=95))[0]
    assert long.direction is Direction.LONG
    assert short.direction is Direction.SHORT
    assert long.family is short.family is SetupFamily.ORB


def test_day_extreme_requires_a_confirmed_boundary(feature_factory):
    assert detect_day_extreme(
        feature_factory(day_high=None, day_low=None),
        completed_close=100.0,
        prior_swing=SimpleNamespace(low=98.0, high=102.0),
    ) == ()


def test_vwap_reclaim_and_rejection_are_mirrored(feature_factory):
    long = detect_vwap(
        feature_factory(vwap=100.0),
        recent_closes=[100.5, 101.0],
        prior_close=99.5,
    )[0]
    short = detect_vwap(
        feature_factory(vwap=100.0),
        recent_closes=[99.5, 99.0],
        prior_close=100.5,
    )[0]
    assert (long.direction, short.direction) == (Direction.LONG, Direction.SHORT)
    assert long.family is short.family is SetupFamily.VWAP


def test_relative_strength_continuation_is_mirrored(feature_factory):
    long = detect_relative_strength(
        feature_factory(
            trend_1m=1, trend_5m=1, rs_persistence=0.8, relative_strength=1.0,
        ),
        recent_swing_low=98.0,
        recent_swing_high=102.0,
    )[0]
    short = detect_relative_strength(
        feature_factory(
            trend_1m=-1, trend_5m=-1, rs_persistence=0.8, relative_strength=-1.0,
        ),
        recent_swing_low=98.0,
        recent_swing_high=102.0,
    )[0]
    assert (long.direction, short.direction) == (Direction.LONG, Direction.SHORT)
    assert long.family is short.family is SetupFamily.RELATIVE_STRENGTH
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_setups.py -q`

Expected: FAIL because setup detectors do not exist.

- [ ] **Step 3: Implement detectors with explicit evidence**

```python
# backend/app/decision/setups.py
def candidate(
    feature, direction, family, anchor_at, boundary, invalidation,
    structure_quality, evidence, warnings=(),
):
    return SetupCandidate(
        symbol=feature.symbol,
        sector=feature.sector,
        direction=direction,
        family=family,
        mode=SessionMode.OPENING if feature.at.time() < time(11, 15) else SessionMode.INTRADAY,
        detected_at=feature.at,
        anchor_at=anchor_at,
        boundary=boundary,
        invalidation=invalidation,
        structure_quality=structure_quality,
        evidence=tuple(evidence),
        warnings=tuple(warnings),
    )


def detect_orb(feature) -> tuple[SetupCandidate, ...]:
    if feature.orb_high is None or feature.orb_low is None or feature.orb_anchor_at is None:
        return ()
    if feature.ltp > feature.orb_high:
        return (candidate(
            feature,
            Direction.LONG,
            SetupFamily.ORB,
            anchor_at=feature.orb_anchor_at,
            boundary=feature.orb_high,
            invalidation=feature.orb_low,
            structure_quality=80.0,
            evidence=("Price above completed opening range",),
        ),)
    if feature.ltp < feature.orb_low:
        return (candidate(
            feature,
            Direction.SHORT,
            SetupFamily.ORB,
            anchor_at=feature.orb_anchor_at,
            boundary=feature.orb_low,
            invalidation=feature.orb_high,
            structure_quality=80.0,
            evidence=("Price below completed opening range",),
        ),)
    return ()
```

Implement the other three families with explicit conditions:

```python
def detect_vwap(feature, recent_closes, prior_close):
    if feature.vwap is None or len(recent_closes) < 2:
        return ()
    held_above = prior_close <= feature.vwap and all(
        close > feature.vwap for close in recent_closes[-2:]
    )
    held_below = prior_close >= feature.vwap and all(
        close < feature.vwap for close in recent_closes[-2:]
    )
    if held_above:
        return (candidate(
            feature, Direction.LONG, SetupFamily.VWAP,
            anchor_at=feature.latest_1m_at,
            boundary=feature.vwap,
            invalidation=min(prior_close, feature.vwap),
            structure_quality=80.0,
            evidence=("VWAP reclaimed and held for two closes",),
        ),)
    if held_below:
        return (candidate(
            feature, Direction.SHORT, SetupFamily.VWAP,
            anchor_at=feature.latest_1m_at,
            boundary=feature.vwap,
            invalidation=max(prior_close, feature.vwap),
            structure_quality=80.0,
            evidence=("VWAP rejected and held for two closes",),
        ),)
    return ()


def detect_relative_strength(feature, recent_swing_low, recent_swing_high):
    aligned_long = (
        feature.trend_1m == 1 and feature.trend_5m == 1
        and (feature.rs_persistence or 0) >= 0.7
        and (feature.relative_strength or 0) > 0
    )
    aligned_short = (
        feature.trend_1m == -1 and feature.trend_5m == -1
        and (feature.rs_persistence or 0) >= 0.7
        and (feature.relative_strength or 0) < 0
    )
    if aligned_long:
        return (candidate(
            feature, Direction.LONG, SetupFamily.RELATIVE_STRENGTH,
            anchor_at=feature.latest_5m_at,
            boundary=feature.latest_5m_close, invalidation=recent_swing_low,
            structure_quality=85.0,
            evidence=("One- and five-minute trends align above NIFTY",),
        ),)
    if aligned_short:
        return (candidate(
            feature, Direction.SHORT, SetupFamily.RELATIVE_STRENGTH,
            anchor_at=feature.latest_5m_at,
            boundary=feature.latest_5m_close, invalidation=recent_swing_high,
            structure_quality=85.0,
            evidence=("One- and five-minute trends align below NIFTY",),
        ),)
    return ()


def detect_day_extreme(feature, completed_close, prior_swing):
    if feature.day_high is not None and completed_close > feature.day_high:
        return (candidate(
            feature, Direction.LONG, SetupFamily.DAY_EXTREME,
            anchor_at=feature.latest_1m_at,
            boundary=feature.day_high, invalidation=prior_swing.low,
            structure_quality=75.0,
            evidence=("Completed candle closed above prior day-high boundary",),
        ),)
    if feature.day_low is not None and completed_close < feature.day_low:
        return (candidate(
            feature, Direction.SHORT, SetupFamily.DAY_EXTREME,
            anchor_at=feature.latest_1m_at,
            boundary=feature.day_low, invalidation=prior_swing.high,
            structure_quality=75.0,
            evidence=("Completed candle closed below prior day-low boundary",),
        ),)
    return ()
```

Each detector must return exact evidence and warning strings used by the UI.

- [ ] **Step 4: Run setup and feature tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_setups.py tests/test_features.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision/setups.py backend/tests/test_setups.py
git commit -m "feat: detect four intraday setup families"
```

### Task 4: Score and stably rank candidates

**Files:**
- Create: `backend/app/decision/scoring.py`
- Create: `backend/app/decision/ranking.py`
- Create: `backend/tests/test_scoring.py`
- Create: `backend/tests/test_ranking.py`

**Interfaces:**
- Consumes: `FeatureSnapshot`, `SetupCandidate`, `structural_room_r: float`,
  prior display score and rank.
- Produces:
  - `score_candidate(candidate, feature, structural_room_r, previous_display=None) -> ScoreBreakdown`
  - `rank_opportunities(rows, previous_order) -> RankedLists`

- [ ] **Step 1: Write failing weight and stability tests**

```python
# backend/tests/test_scoring.py
from app.decision.models import SessionMode
from app.decision.scoring import INTRADAY_WEIGHTS, OPENING_WEIGHTS, smooth


def test_weight_profiles_sum_to_one():
    assert sum(OPENING_WEIGHTS.values()) == 1.0
    assert sum(INTRADAY_WEIGHTS.values()) == 1.0
    assert OPENING_WEIGHTS["relative_volume"] == 0.20
    assert INTRADAY_WEIGHTS["relative_strength"] == 0.20


def test_display_score_uses_approved_smoothing():
    assert smooth(raw=90, previous=70) == 80
```

```python
# backend/tests/test_ranking.py
from app.decision.ranking import stable_order


def test_two_point_hysteresis_prevents_rank_flicker():
    previous = ["TCS", "INFY"]
    scores = {"TCS": 80.0, "INFY": 81.5}
    assert stable_order(scores, previous, hysteresis=2.0) == previous
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_scoring.py tests/test_ranking.py -q`

Expected: FAIL because scoring and ranking modules do not exist.

- [ ] **Step 3: Implement approved profiles**

```python
# backend/app/decision/scoring.py
OPENING_WEIGHTS = {
    "structure": 0.25,
    "relative_strength": 0.15,
    "relative_volume": 0.20,
    "vwap": 0.15,
    "sector": 0.10,
    "market": 0.10,
    "trade_quality": 0.05,
}
INTRADAY_WEIGHTS = {
    "structure": 0.25,
    "relative_strength": 0.20,
    "relative_volume": 0.15,
    "vwap": 0.15,
    "sector": 0.10,
    "market": 0.10,
    "trade_quality": 0.05,
}


def smooth(raw: float, previous: float | None) -> float:
    return round(raw if previous is None else 0.5 * raw + 0.5 * previous, 2)
```

Map raw features with named, deterministic functions:

```python
def clamp(value):
    return round(max(0.0, min(100.0, value)), 2)


def signed(direction, value):
    return value if direction is Direction.LONG else -value


def component_scores(candidate, feature, structural_room_r):
    rs = None if feature.relative_strength is None else clamp(
        0.6 * clamp(50 + 25 * signed(candidate.direction, feature.relative_strength))
        + 0.4 * 100 * (feature.rs_persistence or 0)
    )
    rvol = None if feature.relative_volume is None else clamp(
        0.7 * clamp((feature.relative_volume - 0.5) / 1.5 * 100)
        + 0.3 * clamp(50 + 25 * (feature.volume_acceleration or 0))
    )
    vwap = None if feature.vwap is None else clamp(
        70 * (feature.vwap_persistence or 0)
        + 30 * (1 if signed(candidate.direction, feature.ltp - feature.vwap) > 0 else 0)
    )
    sector = None if feature.sector_strength is None else clamp(
        0.6 * clamp(50 + 25 * signed(candidate.direction, feature.sector_strength))
        + 0.4 * clamp(50 + 50 * signed(candidate.direction, feature.sector_breadth or 0))
    )
    market = None if feature.market_strength is None else clamp(
        0.6 * clamp(50 + 25 * signed(candidate.direction, feature.market_strength))
        + 0.4 * clamp(50 + 50 * signed(candidate.direction, feature.market_breadth or 0))
    )
    trade_quality = clamp((structural_room_r - 1.5) / 1.5 * 100)
    return {
        "structure": clamp(candidate.structure_quality),
        "relative_strength": rs,
        "relative_volume": rvol,
        "vwap": vwap,
        "sector": sector,
        "market": market,
        "trade_quality": trade_quality,
    }
```

If any component is `None`, return `complete=False`, list the missing keys, and
exclude the row from top-ten ranking. Rank long and short separately, cap each
at ten, preserve prior order within two points, and break remaining ties by
symbol.

- [ ] **Step 4: Run scoring and ranking tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_scoring.py tests/test_ranking.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision/scoring.py backend/app/decision/ranking.py backend/tests/test_scoring.py backend/tests/test_ranking.py
git commit -m "feat: score and stably rank opportunities"
```

### Task 5: Apply eligibility gates and build trade plans

**Files:**
- Create: `backend/app/decision/trade_plan.py`
- Create: `backend/tests/test_trade_plan.py`

**Interfaces:**
- Consumes: candidate, feature snapshot, tick size, nearest counter-level, market close.
- Produces: `plan_trade(...) -> TradePlanResult`, containing `plan: TradePlan | None` and exact blocker strings.

- [ ] **Step 1: Write failing trade-plan tests**

```python
# backend/tests/test_trade_plan.py
import pytest

from app.decision.models import Direction
from app.decision.trade_plan import evaluate_gates, levels


BASE_GATES = {
    "direction": Direction.LONG,
    "feed_age_seconds": 1.0,
    "symbol_age_seconds": 1.0,
    "benchmark_fresh": True,
    "required_inputs_complete": True,
    "sector_coverage": 1.0,
    "history_sessions": 20,
    "risk_atr": 1.0,
    "structural_room_r": 2.0,
    "vwap_extension_atr": 0.5,
    "retest_valid": False,
    "minutes_to_close": 120,
    "current_price": 100.0,
    "trigger": 100.2,
}


def test_long_levels_use_atr_and_tick_buffer():
    plan = levels(
        direction=Direction.LONG,
        boundary=100.0,
        invalidation=98.0,
        atr5=4.0,
        tick_size=0.05,
    )
    assert plan.trigger == 100.20
    assert plan.stop == 97.80
    assert plan.risk == 2.40
    assert plan.t1 == 102.60
    assert plan.t2 == 105.00


def test_short_levels_are_mirrored():
    plan = levels(Direction.SHORT, 100.0, 102.0, atr5=4.0, tick_size=0.05)
    assert plan.trigger == 99.80
    assert plan.stop == 102.20


@pytest.mark.parametrize(("override", "expected"), [
    ({"feed_age_seconds": 10.01}, "stale_feed"),
    ({"symbol_age_seconds": 30.01}, "stale_symbol"),
    ({"benchmark_fresh": False}, "benchmark_unavailable"),
    ({"required_inputs_complete": False}, "required_input_unavailable"),
    ({"sector_coverage": 0.69}, "sector_coverage_low"),
    ({"history_sessions": 9}, "volume_history_short"),
    ({"risk_atr": 0.24}, "risk_too_tight"),
    ({"risk_atr": 2.51}, "risk_too_wide"),
    ({"structural_room_r": 1.49}, "structural_room_low"),
    ({"vwap_extension_atr": 1.51}, "vwap_extended"),
    ({"minutes_to_close": 29}, "too_late_in_session"),
    ({"current_price": 100.21}, "late_extended"),
])
def test_each_gate_returns_a_stable_blocker_code(override, expected):
    values = {**BASE_GATES, **override}
    assert expected in evaluate_gates(**values)


def test_retest_allows_an_otherwise_extended_setup():
    values = {**BASE_GATES, "vwap_extension_atr": 1.75, "retest_valid": True}
    assert "vwap_extended" not in evaluate_gates(**values)


def test_eligible_setup_has_no_blockers():
    assert evaluate_gates(**BASE_GATES) == ()
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_trade_plan.py -q`

Expected: FAIL because trade planning is missing.

- [ ] **Step 3: Implement deterministic levels and blockers**

```python
# backend/app/decision/trade_plan.py
def levels(direction, boundary, invalidation, atr5, tick_size):
    buffer = max(tick_size, round(0.05 * atr5 / tick_size) * tick_size)
    sign = 1 if direction is Direction.LONG else -1
    trigger = round_to_tick(boundary + sign * buffer, tick_size)
    stop = round_to_tick(invalidation - sign * buffer, tick_size)
    risk = abs(trigger - stop)
    return TradePlan(
        trigger=trigger,
        stop=stop,
        t1=round_to_tick(trigger + sign * risk, tick_size),
        t2=round_to_tick(trigger + sign * 2 * risk, tick_size),
        risk=round(risk, 4),
        structural_room_r=0.0,
    )
```

Evaluate all gates and return every blocker rather than stopping at the first.
Use blocker codes plus user-facing copy so tests and UI do not depend on prose.
Implement the exact `evaluate_gates` keyword-only signature exercised above.
For shorts, `current_price < trigger` is late; for longs,
`current_price > trigger` is late. Boundary values pass: ages of 10/30 seconds,
70% sector coverage, 10 sessions, 0.25/2.5 ATR risk, 1.5R room, 1.5 ATR
extension, and 30 minutes remaining. An already-crossed trigger must produce
`late_extended`. Map every code to presentation copy in a separate
`BLOCKER_MESSAGES` constant.

- [ ] **Step 4: Run trade-plan and model tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_trade_plan.py tests/test_decision_models.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision/trade_plan.py backend/tests/test_trade_plan.py
git commit -m "feat: calculate guarded trade frameworks"
```

### Task 6: Persist and enforce the signal lifecycle

**Files:**
- Modify: `backend/app/storage/migrations.py`
- Modify: `backend/app/storage/repository.py`
- Create: `backend/app/decision/lifecycle.py`
- Create: `backend/tests/test_lifecycle.py`

**Interfaces:**
- Consumes: scored candidate, trade plan, current price/time, persisted prior state.
- Produces:
  - `LifecycleResult(record: SignalRecord, events: tuple[SignalEvent, ...])`
  - `SignalLifecycle.observe(candidate, features, score, plan, blockers, current_price) -> LifecycleResult`
  - `MarketRepository.save_transition(record, event) -> bool`
  - one `triggered` event per setup identity.

- [ ] **Step 1: Write failing lifecycle tests**

```python
# backend/tests/test_lifecycle.py
import pytest

from app.decision.lifecycle import SignalLifecycle
from app.decision.models import ScoreBreakdown, TradePlan
from app.storage.database import Database
from app.storage.repository import MarketRepository


def scored(candidate, value):
    keys = (
        "structure", "relative_strength", "relative_volume", "vwap",
        "sector", "market", "trade_quality",
    )
    return ScoreBreakdown(
        setup_id=candidate.setup_id,
        raw_score=value,
        display_score=value,
        components={key: value for key in keys},
        complete=True,
        missing=(),
    )


PLAN = TradePlan(
    trigger=100.2,
    stop=98.0,
    t1=102.4,
    t2=104.6,
    risk=2.2,
    structural_room_r=2.0,
)


@pytest.fixture
def lifecycle_factory(tmp_path, clock):
    database = Database(str(tmp_path / "lifecycle.db"))
    database.migrate()
    repository = MarketRepository(database)
    return lambda: SignalLifecycle(repository=repository, clock=clock)


@pytest.fixture
def lifecycle(lifecycle_factory):
    return lifecycle_factory()


def test_candidate_arms_after_three_consecutive_scores(
    lifecycle, candidate, feature,
):
    one = lifecycle.observe(candidate, feature, scored(candidate, 75), PLAN, (), 99.5)
    two = lifecycle.observe(candidate, feature, scored(candidate, 77), PLAN, (), 99.5)
    three = lifecycle.observe(candidate, feature, scored(candidate, 76), PLAN, (), 99.5)
    assert one.record.state == "watching"
    assert two.record.state == "watching"
    assert three.record.state == "armed"


def test_trigger_event_is_idempotent_across_reload(
    lifecycle_factory, candidate, feature,
):
    lifecycle = lifecycle_factory()
    for _ in range(3):
        lifecycle.observe(candidate, feature, scored(candidate, 80), PLAN, (), 99.5)
    first = lifecycle.observe(
        candidate, feature, scored(candidate, 80), PLAN, (), 100.3,
    )
    second = lifecycle_factory().observe(
        candidate, feature, scored(candidate, 80), PLAN, (), 100.3,
    )
    assert [event.event_type for event in first.events] == ["triggered"]
    assert second.events == ()
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_lifecycle.py -q`

Expected: FAIL because lifecycle persistence is missing.

- [ ] **Step 3: Add migration 2 and transition logic**

```sql
CREATE TABLE signals (
    setup_id TEXT PRIMARY KEY,
    session_date TEXT NOT NULL,
    symbol TEXT NOT NULL,
    sector TEXT NOT NULL,
    direction TEXT NOT NULL,
    family TEXT NOT NULL,
    mode TEXT NOT NULL,
    state TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    armed_at TEXT,
    triggered_at TEXT,
    completed_at TEXT,
    score_json TEXT NOT NULL,
    features_json TEXT NOT NULL,
    evidence_json TEXT NOT NULL,
    plan_json TEXT,
    consecutive_eligible INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
CREATE INDEX ix_signals_session_state ON signals(session_date, state);

CREATE TABLE signal_events (
    event_id TEXT PRIMARY KEY,
    setup_id TEXT NOT NULL REFERENCES signals(setup_id),
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    payload_json TEXT NOT NULL
);
```

Represent allowed transitions as an explicit mapping:

```python
ALLOWED_TRANSITIONS = {
    LifecycleState.WATCHING: {
        LifecycleState.ARMED,
        LifecycleState.INVALIDATED,
        LifecycleState.EXPIRED,
    },
    LifecycleState.ARMED: {
        LifecycleState.TRIGGERED,
        LifecycleState.INVALIDATED,
        LifecycleState.EXPIRED,
    },
    LifecycleState.TRIGGERED: {LifecycleState.ACTIVE},
    LifecycleState.ACTIVE: {LifecycleState.COMPLETED},
    LifecycleState.COMPLETED: set(),
    LifecycleState.INVALIDATED: set(),
    LifecycleState.EXPIRED: set(),
}
```

Reject transitions outside this map. A gate or structure failure before trigger
invalidates; an ended validity window or fewer than 30 minutes remaining
expires. The evaluation immediately after `triggered` advances to `active`.
Persist record and event in one transaction. Build `event_id` from setup ID,
transition type, and transition boundary so retries are no-ops.

- [ ] **Step 4: Run lifecycle and repository tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_lifecycle.py tests/test_repository.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage backend/app/decision/lifecycle.py backend/tests/test_lifecycle.py
git commit -m "feat: persist auditable signal lifecycles"
```

### Task 7: Track outcomes without rewriting the frozen plan

**Files:**
- Modify: `backend/app/storage/migrations.py`
- Modify: `backend/app/storage/repository.py`
- Create: `backend/app/decision/outcomes.py`
- Create: `backend/tests/test_outcomes.py`

**Interfaces:**
- Consumes: triggered signal with frozen `TradePlan`, subsequent completed candles.
- Produces: `OutcomeTracker.apply(signal, candle) -> SignalOutcome` and persisted `signal_outcomes`.

- [ ] **Step 1: Write failing outcome-path tests**

```python
# backend/tests/test_outcomes.py
from dataclasses import replace

import pytest

from app.decision.models import (
    LifecycleState, ScoreBreakdown, SignalRecord, TradePlan,
)
from app.decision.outcomes import OutcomeTracker
from app.market.models import Candle
from app.storage.database import Database
from app.storage.repository import MarketRepository
from tests.factories import BASE_AT, make_feature


@pytest.fixture
def outcome_tracker(tmp_path):
    database = Database(str(tmp_path / "outcomes.db"))
    database.migrate()
    return OutcomeTracker(MarketRepository(database))


@pytest.fixture
def long_signal(candidate):
    return SignalRecord(
        setup_id=candidate.setup_id,
        state=LifecycleState.ACTIVE,
        candidate=candidate,
        features=make_feature(),
        score=ScoreBreakdown(
            candidate.setup_id, 80.0, 80.0,
            {key: 80.0 for key in (
                "structure", "relative_strength", "relative_volume", "vwap",
                "sector", "market", "trade_quality",
            )},
            True,
            (),
        ),
        plan=TradePlan(100.0, 98.0, 102.0, 104.0, 2.0, 2.0),
        consecutive_eligible=3,
        detected_at=BASE_AT,
        armed_at=BASE_AT,
        triggered_at=BASE_AT,
        completed_at=None,
    )


def make_candle(at, high, low, close=100.0):
    return Candle("TCS", "5m", at, 100.0, high, low, close, 1000, 100.0, True)


def test_stop_before_t1_is_false_breakout(outcome_tracker, long_signal):
    result = outcome_tracker.apply(
        long_signal,
        make_candle(long_signal.triggered_at, high=100.5, low=97.5),
    )
    assert result.path == "stop_before_t1"
    assert result.false_breakout is True


def test_t1_then_t2_records_follow_through(outcome_tracker, long_signal):
    one = outcome_tracker.apply(
        long_signal,
        make_candle(long_signal.triggered_at, high=103.0, low=99.0),
    )
    two = outcome_tracker.apply(
        long_signal,
        make_candle(long_signal.triggered_at, high=106.0, low=102.0),
    )
    assert one.path == "t1_open"
    assert two.path == "t1_then_t2"
    assert two.follow_through is True
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_outcomes.py -q`

Expected: FAIL because outcome tracking is missing.

- [ ] **Step 3: Add migration 3 and outcome calculations**

Create `signal_outcomes` keyed by `setup_id` with `path`, `t1_at`, `t2_at`,
`stop_at`, `mfe_r`, `mae_r`, `follow_through`, `false_breakout`, and
`end_state`. Update MFE/MAE using candle extremes and the frozen risk:

```python
def excursion_r(direction, plan, high, low):
    if direction is Direction.LONG:
        return (high - plan.trigger) / plan.risk, (low - plan.trigger) / plan.risk
    return (plan.trigger - low) / plan.risk, (plan.trigger - high) / plan.risk
```

When one candle touches both stop and a target and tick order is unavailable,
use the conservative path: stop is assumed first. Persist every update
idempotently and never modify `signals.plan_json`.

- [ ] **Step 4: Run outcome and lifecycle tests**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_outcomes.py tests/test_lifecycle.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage backend/app/decision/outcomes.py backend/tests/test_outcomes.py
git commit -m "feat: record deterministic signal outcomes"
```

### Task 8: Orchestrate evaluation, replay, and shadow mode

**Files:**
- Create: `backend/app/decision/evaluator.py`
- Create: `backend/app/replay.py`
- Create: `backend/tests/fixtures/replay/opening_session.jsonl`
- Create: `backend/tests/test_evaluator.py`
- Create: `backend/tests/test_replay.py`
- Modify: `backend/app/main.py:66-70`
- Modify: `backend/app/config.py`

**Interfaces:**
- Consumes: market snapshot, repository candles/baselines, decision modules, clock.
- Produces:
  - `DecisionEvaluator(repository, snapshot_provider, clock, publish_event, settings)`
  - `DecisionEvaluator.evaluate(at: datetime) -> DecisionSnapshot`
  - `DecisionEvaluator.latest() -> DecisionSnapshot`
  - `run_replay(path: Path) -> dict` and a stable CLI JSON summary with ranks,
    transitions, and outcomes.

- [ ] **Step 1: Write failing evaluator and replay tests**

```python
# backend/tests/test_evaluator.py
import pytest

from app.decision.evaluator import DecisionEvaluator
from app.market.models import MarketSnapshot, StockSnapshot
from app.storage.database import Database
from app.storage.repository import MarketRepository


def stock(symbol, sector, at, age=1.0):
    return StockSnapshot(
        symbol=symbol,
        sector=sector,
        ltp=100.0,
        prev_close=99.0,
        pct_change=1.0101,
        day_high=101.0,
        day_low=98.0,
        cumulative_volume=1000,
        vwap=99.5,
        last_tick_at=at,
        age_seconds=age,
    )


def market(at, feed_age=1.0):
    return MarketSnapshot(
        at=at,
        market_open=True,
        feed_age_seconds=feed_age,
        nifty=stock("NIFTY50-INDEX", "Benchmark", at),
        stocks=(stock("TCS", "IT", at),),
    )


@pytest.fixture
def evaluator_harness(tmp_path, clock):
    database = Database(str(tmp_path / "evaluator.db"))
    database.migrate()
    box = {"snapshot": market(clock.now())}
    evaluator = DecisionEvaluator(
        repository=MarketRepository(database),
        snapshot_provider=lambda: box["snapshot"],
        clock=clock,
        publish_event=lambda event: None,
        settings={"shadow_mode": True, "feature_interval": 5},
    )
    return evaluator, box


def test_evaluator_switches_mode_at_1115(evaluator_harness, clock):
    evaluator, _ = evaluator_harness
    clock.set("2026-07-29T11:14:59+05:30")
    assert evaluator.evaluate(clock.now()).mode == "opening"
    clock.set("2026-07-29T11:15:00+05:30")
    assert evaluator.evaluate(clock.now()).mode == "intraday"


def test_stale_feed_cannot_arm(evaluator_harness, clock):
    evaluator, box = evaluator_harness
    box["snapshot"] = market(clock.now(), feed_age=10.01)
    snapshot = evaluator.evaluate(clock.now())
    assert "stale_feed" in snapshot.blockers
    assert all(row.state != "armed" for row in snapshot.all_opportunities)
```

```python
# backend/tests/test_replay.py
from pathlib import Path

from app.replay import run_replay


REPLAY_FIXTURE = Path(__file__).parent / "fixtures/replay/opening_session.jsonl"


def test_replay_is_deterministic():
    first = run_replay(REPLAY_FIXTURE)
    second = run_replay(REPLAY_FIXTURE)
    assert first == second
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests/test_evaluator.py tests/test_replay.py -q`

Expected: FAIL because evaluator and replay entry points do not exist.

- [ ] **Step 3: Implement the five-second evaluator**

`DecisionEvaluator` must:

1. Read one immutable market snapshot.
2. Build market/sector context once.
3. Build features and detect candidates per stock.
4. Score and plan each candidate.
5. Apply lifecycle transitions transactionally.
6. Rank long and short lists.
7. Store one immutable latest decision snapshot.
8. Publish transition events through an injected callback.

Run it as one asyncio task from FastAPI lifespan using
`config.FEATURE_INTERVAL`. `SHADOW_MODE=true` must persist and expose decisions
but suppress sound/browser alert event publication.

Implement `backend/app/replay.py` to read JSONL normalized ticks/candles, advance
an injected clock, call the same evaluator, and print stable JSON with no live
FYERS imports. `run_replay` returns the serializable dictionary; the CLI prints
it with `json.dumps(result, sort_keys=True, separators=(",", ":"))`.

- [ ] **Step 4: Run the full backend suite and replay**

Run: `cd backend; .\.venv\Scripts\python.exe -m pytest tests -q`

Run: `cd backend; .\.venv\Scripts\python.exe -m app.replay tests/fixtures/replay/opening_session.jsonl`

Expected: tests PASS; replay output is byte-for-byte stable across two runs.

- [ ] **Step 5: Commit**

```bash
git add backend/app/decision/evaluator.py backend/app/replay.py backend/app/main.py backend/app/config.py backend/tests
git commit -m "feat: orchestrate intraday decision evaluation"
```

## Plan 2 Completion Gate

Run the complete backend suite and replay fixture. Verify:

- Both rank lists contain at most ten fully scored candidates.
- The same fixture produces the same scores, ordering, and transitions.
- Stale/incomplete candidates never arm.
- The same setup identity cannot alert twice after a recreated lifecycle service.
- Triggered plan JSON remains unchanged while outcomes update.
- Shadow mode exposes decisions without publishing user-facing alert events.

Proceed to Plan 3 only after this gate passes.
