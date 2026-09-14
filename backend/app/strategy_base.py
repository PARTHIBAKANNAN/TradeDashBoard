from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, time as dt_time
from enum import Enum
from typing import Any, Protocol


class Direction(Enum):
    BULL = "Bull"
    BEAR = "Bear"


class StrategyFamily(Enum):
    """Logical grouping for risk quota allocation."""
    ORB_BREAKOUT = "ORB"
    VWAP_RETEST = "VWAP"
    SECTOR_SYMPATHY = "SECTOR"
    SQUEEZE = "SQUEEZE"


@dataclass(frozen=True, slots=True)
class SignalEvent:
    """Immutable record of a strategy signal. Replaces loose string signals."""
    strategy_family: StrategyFamily
    strategy_name: str         # e.g. "C0.5", "C1", "C2", "C3", "C4", "VWAP_RETEST", "SECTOR_LAG"
    direction: Direction
    symbol: str
    trigger_price: float       # structural level that was breached
    signal_time: datetime
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def label(self) -> str:
        """Human-readable label matching current format: 'Bull • C1', 'Bear • VWAP Retest'"""
        if self.strategy_name == "VWAP_RETEST":
            return f"{self.direction.value} • VWAP Retest"
        return f"{self.direction.value} • {self.strategy_name}"

    @property
    def is_bull(self) -> bool:
        return self.direction == Direction.BULL


class Strategy(Protocol):
    """Interface every strategy must implement."""

    @property
    def name(self) -> str: ...

    @property
    def family(self) -> StrategyFamily: ...

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        """(start, end) IST times when this strategy scans."""
        ...

    def evaluate(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        """Return a SignalEvent if conditions are met, else None.

        MUST be deterministic and side-effect-free.
        The caller holds MarketState's lock; do NOT acquire it again.
        """
        ...


class StrategyRegistry:
    """Ordered collection of strategies, evaluated in registration order."""

    def __init__(self):
        self._strategies: list[Strategy] = []

    def register(self, strategy: Strategy) -> None:
        self._strategies.append(strategy)

    def get_strategies(self) -> list[Strategy]:
        return list(self._strategies)

    def evaluate_all(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        """First strategy to fire wins. Returns None if no signal."""
        now_t = now.time()
        for strat in self._strategies:
            start, end = strat.active_window
            if not (start <= now_t <= end):
                continue
            signal = strat.evaluate(stock, now, all_stocks=all_stocks)
            if signal is not None:
                return signal
        return None
