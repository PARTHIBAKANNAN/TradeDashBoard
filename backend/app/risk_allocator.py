from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from threading import RLock
from typing import Optional

from .strategy_base import StrategyFamily


@dataclass
class FamilyBudget:
    max_trades: int
    used_trades: int = 0
    max_risk_inr: float = 0.0
    used_risk_inr: float = 0.0
    max_alerts: int = 1
    used_alerts: int = 0

    @property
    def remaining_trades(self) -> int:
        return max(0, self.max_trades - self.used_trades)

    @property
    def remaining_risk(self) -> float:
        return max(0.0, self.max_risk_inr - self.used_risk_inr)

    @property
    def remaining_alerts(self) -> int:
        return max(0, self.max_alerts - self.used_alerts)


class RiskAllocator:
    """Portfolio-level daily risk budget with per-strategy-family sub-limits.

    Default allocation (₹3,400 total daily risk):
      ORB_BREAKOUT:    1 trade,  ₹1,000 risk, 1 alert
      VWAP_RETEST:     1 trade,  ₹800 risk,   1 alert
      SECTOR_SYMPATHY: 1 trade,  ₹800 risk,   1 alert
      SQUEEZE:         1 trade,  ₹800 risk,   1 alert

    Thread-safe: all mutations go through the RLock.
    """

    def __init__(
        self,
        total_risk_inr: Optional[float] = None,
        orb_trades: Optional[int] = None,
        orb_risk: Optional[float] = None,
        vwap_trades: Optional[int] = None,
        vwap_risk: Optional[float] = None,
        sector_trades: Optional[int] = None,
        sector_risk: Optional[float] = None,
        squeeze_trades: Optional[int] = None,
        squeeze_risk: Optional[float] = None,
        alerts_per_strategy: Optional[int] = None,
    ):
        from . import config as _cfg

        self._lock = RLock()
        self._total_risk = total_risk_inr if total_risk_inr is not None else getattr(_cfg, "DAILY_MAX_RISK_INR", 3400.0)
        self._orb_trades = orb_trades if orb_trades is not None else getattr(_cfg, "ORB_BUDGET_TRADES", 1)
        self._orb_risk = orb_risk if orb_risk is not None else getattr(_cfg, "ORB_BUDGET_RISK", 1000.0)
        self._vwap_trades = vwap_trades if vwap_trades is not None else getattr(_cfg, "VWAP_BUDGET_TRADES", 1)
        self._vwap_risk = vwap_risk if vwap_risk is not None else getattr(_cfg, "VWAP_BUDGET_RISK", 800.0)
        self._sector_trades = sector_trades if sector_trades is not None else getattr(_cfg, "SECTOR_BUDGET_TRADES", 1)
        self._sector_risk = sector_risk if sector_risk is not None else getattr(_cfg, "SECTOR_BUDGET_RISK", 800.0)
        self._squeeze_trades = squeeze_trades if squeeze_trades is not None else getattr(_cfg, "SQUEEZE_BUDGET_TRADES", 1)
        self._squeeze_risk = squeeze_risk if squeeze_risk is not None else getattr(_cfg, "SQUEEZE_BUDGET_RISK", 800.0)
        self._alerts_per_strategy = alerts_per_strategy if alerts_per_strategy is not None else getattr(_cfg, "MAX_MANUAL_ALERTS_PER_STRATEGY", 1)

        self._reset_date: Optional[date] = None
        self._budgets: dict[StrategyFamily, FamilyBudget] = {}
        self._configure_defaults()

    def _configure_defaults(self) -> None:
        self._budgets = {
            StrategyFamily.ORB_BREAKOUT: FamilyBudget(
                max_trades=self._orb_trades,
                max_risk_inr=self._orb_risk,
                max_alerts=self._alerts_per_strategy,
            ),
            StrategyFamily.VWAP_RETEST: FamilyBudget(
                max_trades=self._vwap_trades,
                max_risk_inr=self._vwap_risk,
                max_alerts=self._alerts_per_strategy,
            ),
            StrategyFamily.SECTOR_SYMPATHY: FamilyBudget(
                max_trades=self._sector_trades,
                max_risk_inr=self._sector_risk,
                max_alerts=self._alerts_per_strategy,
            ),
            StrategyFamily.SQUEEZE: FamilyBudget(
                max_trades=self._squeeze_trades,
                max_risk_inr=self._squeeze_risk,
                max_alerts=self._alerts_per_strategy,
            ),
        }

    def _ensure_reset(self, today: date) -> None:
        if self._reset_date != today:
            self._configure_defaults()
            self._reset_date = today

    def can_trade(self, family: StrategyFamily, today: date) -> bool:
        with self._lock:
            self._ensure_reset(today)
            budget = self._budgets.get(family)
            if not budget:
                return False
            return budget.remaining_trades > 0 and budget.remaining_risk > 0

    def consume(self, family: StrategyFamily, risk_inr: float, today: date) -> bool:
        with self._lock:
            self._ensure_reset(today)
            budget = self._budgets.get(family)
            if not budget or budget.remaining_trades <= 0:
                return False
            if risk_inr > budget.remaining_risk:
                return False
            budget.used_trades += 1
            budget.used_risk_inr += risk_inr
            return True

    def can_alert(self, family: StrategyFamily, today: date) -> bool:
        with self._lock:
            self._ensure_reset(today)
            budget = self._budgets.get(family)
            if not budget:
                return False
            return budget.remaining_alerts > 0

    def consume_alert(self, family: StrategyFamily, today: date) -> bool:
        with self._lock:
            self._ensure_reset(today)
            budget = self._budgets.get(family)
            if not budget or budget.remaining_alerts <= 0:
                return False
            budget.used_alerts += 1
            return True

    def get_risk_per_trade(self, family: StrategyFamily, today: date) -> float:
        with self._lock:
            self._ensure_reset(today)
            budget = self._budgets.get(family)
            if not budget or budget.remaining_trades <= 0:
                return 0.0
            return budget.remaining_risk / budget.remaining_trades

    def summary(self, today: date) -> dict[str, dict[str, str]]:
        with self._lock:
            self._ensure_reset(today)
            return {
                f.name: {
                    "trades": f"{b.used_trades}/{b.max_trades}",
                    "alerts": f"{b.used_alerts}/{b.max_alerts}",
                    "risk": f"₹{b.used_risk_inr:.0f}/₹{b.max_risk_inr:.0f}",
                }
                for f, b in self._budgets.items()
            }


_global_allocator: Optional[RiskAllocator] = None
_allocator_lock = RLock()


def get_risk_allocator() -> RiskAllocator:
    global _global_allocator
    with _allocator_lock:
        if _global_allocator is None:
            _global_allocator = RiskAllocator()
        return _global_allocator


def reset_risk_allocator(allocator: Optional[RiskAllocator] = None) -> None:
    global _global_allocator
    with _allocator_lock:
        _global_allocator = allocator
