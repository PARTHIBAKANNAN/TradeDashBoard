from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time
from typing import Any

from .. import candle_aggregator
from ..strategy_base import Direction, SignalEvent, StrategyFamily
from ..technical_indicators import detect_volatility_squeeze


class SqueezeStrategy:
    """Volatility Squeeze Expansion Strategy (Bollinger Bands expanding outside Keltner Channels).

    Entry Conditions:
    1. Active window: 10:00 – 14:30 IST.
    2. Squeeze consolidation prior: BB inside KC for >= 3 bars.
    3. Squeeze release / expansion: current BB expands outside KC.
    4. Directional breakout:
       - Bull: LTP > Upper BB, RS vs NIFTY >= 0, LTP >= VWAP
       - Bear: LTP < Lower BB, RS vs NIFTY <= 0, LTP <= VWAP
    """

    @property
    def name(self) -> str:
        return "SQUEEZE_EXPANSION"

    @property
    def family(self) -> StrategyFamily:
        return StrategyFamily.SQUEEZE

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        return (dt_time(10, 0), dt_time(14, 30))

    def evaluate(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        sym = stock.get("symbol", "")
        if not sym:
            return None

        current_signal = stock.get("signal")
        if current_signal in ("Bull • Squeeze Expansion", "Bear • Squeeze Expansion"):
            return None

        short_sym = sym.replace("NSE:", "").replace("-EQ", "")
        candles = candle_aggregator.get_intraday_candles(short_sym)
        if len(candles) < 23:  # 20 period + 3 squeeze bars minimum
            return None

        is_sq, is_fired, metrics = detect_volatility_squeeze(candles)
        if not is_fired:
            return None

        ltp = stock.get("ltp", 0.0)
        vwap = stock.get("vwap", 0.0)
        rs = stock.get("relative_strength", 0.0)
        upper_bb = metrics.get("upper_bb", 0.0)
        lower_bb = metrics.get("lower_bb", 0.0)

        is_bull = (ltp >= upper_bb) and (rs >= 0) and (ltp >= vwap if vwap else True)
        is_bear = (ltp <= lower_bb) and (rs <= 0) and (ltp <= vwap if vwap else True)

        if not is_bull and not is_bear:
            return None

        direction = Direction.BULL if is_bull else Direction.BEAR
        trigger_price = upper_bb if is_bull else lower_bb

        return SignalEvent(
            strategy_family=StrategyFamily.SQUEEZE,
            strategy_name="Squeeze Expansion",
            direction=direction,
            symbol=sym,
            trigger_price=trigger_price,
            signal_time=now,
            metadata=metrics,
        )
