from __future__ import annotations

import logging
from datetime import datetime
from datetime import time as dt_time
from typing import Any

from .. import candle_aggregator
from ..strategy_base import Direction, SignalEvent, StrategyFamily

logger = logging.getLogger(__name__)


class OISqueezeStrategy:
    """
    Futures & Derivative Open Interest (Delta-OI) Momentum Squeeze Strategy:
    Triggers when institutional participants aggressively build leveraged derivative positions
    (Long Buildup or Short Covering Squeeze) synchronized with spot equity breakouts.

    Conditions & Scoring:
    1. Active window: 09:45 – 14:45 IST.
    2. Structural Trigger: Stock is at or breaking Day High (Bull) or Day Low (Bear).
    3. Soft Confidence Scoring (Needs >= 65/100):
       - OI Change >= 2.5%: +30 pts
       - Positive Order Flow Delta / CVD: +25 pts
       - Intraday Relative Strength (RS >= 1.0): +25 pts
       - Order Book Imbalance (TBI >= +0.15): +20 pts
    """

    @property
    def name(self) -> str:
        return "OI_SQUEEZE"

    @property
    def family(self) -> StrategyFamily:
        return StrategyFamily.OI_SQUEEZE

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        return (dt_time(9, 45), dt_time(14, 45))

    def evaluate(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        sym = stock.get("symbol", "")
        ltp = stock.get("ltp") or 0.0
        oi = stock.get("oi") or 0
        oi_pct = stock.get("oi_pct") or 0.0

        if not ltp or oi <= 0:
            return None  # Only applicable for derivative F&O stocks

        current_signal = stock.get("signal")
        if current_signal and "OI Squeeze" in current_signal:
            return None

        today_h = stock.get("today_high") or ltp
        today_l = stock.get("today_low") or ltp
        rs = stock.get("relative_strength") or 0.0
        tick_delta = stock.get("tick_delta") or 0.0
        cvd = stock.get("cvd") or 0.0
        book_imbalance = stock.get("book_imbalance") or 0.0
        vwap = stock.get("vwap") or stock.get("ap") or ltp

        # 1. Structural Trigger (Price within 0.3% of Day High or Day Low)
        is_bull_breakout = (ltp >= today_h * 0.997) and (ltp >= vwap)
        is_bear_breakdown = (ltp <= today_l * 1.003) and (ltp <= vwap)

        if not is_bull_breakout and not is_bear_breakdown:
            return None

        # 2. Weighted Confidence Scoring
        score = 0
        if is_bull_breakout:
            direction = Direction.BULL
            # OI Buildup
            if oi_pct >= 2.0:
                score += 30
            elif oi_pct >= 0.8:
                score += 20
            # Order Flow Delta confirmation
            if tick_delta > 0 or cvd > 0:
                score += 25
            # Relative Strength confirmation
            if rs >= 1.0:
                score += 25
            elif rs >= 0.5:
                score += 15
            # Order Book Depth confirmation
            if book_imbalance >= 0.15:
                score += 20
            elif book_imbalance > 0:
                score += 10
        else:
            direction = Direction.BEAR
            # OI Buildup on Short side
            if oi_pct >= 2.0:
                score += 30
            elif oi_pct >= 0.8:
                score += 20
            # Order Flow Delta confirmation
            if tick_delta < 0 or cvd < 0:
                score += 25
            # Relative Strength confirmation
            if rs <= -1.0:
                score += 25
            elif rs <= -0.5:
                score += 15
            # Order Book Depth confirmation
            if book_imbalance <= -0.15:
                score += 20
            elif book_imbalance < 0:
                score += 10

        # Save computed score to stock state for ranking & UI transparency
        stock["strategy_score"] = score

        if score < 65:
            return None

        stock["strategy_name"] = "OI_SQUEEZE"
        trigger_price = today_h if direction == Direction.BULL else today_l

        return SignalEvent(
            strategy_family=StrategyFamily.OI_SQUEEZE,
            strategy_name="OI Squeeze",
            direction=direction,
            symbol=sym,
            trigger_price=trigger_price,
            signal_time=now,
            metadata={
                "score": score,
                "oi": oi,
                "oi_pct": oi_pct,
                "cvd": cvd,
                "tick_delta": tick_delta,
                "book_imbalance": book_imbalance,
            },
        )
