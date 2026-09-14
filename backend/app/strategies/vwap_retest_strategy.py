from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time

from .. import ai_copilot, candle_aggregator
from .. import config as _cfg
from .. import technical_indicators as _ti
from ..strategy_base import Direction, SignalEvent, StrategyFamily


class VWAPRetestStrategy:
    """Institutional VWAP Retest & Pullback Strategy."""

    @property
    def name(self) -> str:
        return "VWAP_RETEST"

    @property
    def family(self) -> StrategyFamily:
        return StrategyFamily.VWAP_RETEST

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        return (dt_time(9, 15), dt_time(11, 0))

    def evaluate(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        session_minute = (now.hour - 9) * 60 + (now.minute - 15)
        scan_cutoff = getattr(_cfg, "MARKET_SCAN_END_MINUTE", 105)

        if session_minute > scan_cutoff:
            return None

        current_signal = stock.get("signal")
        if current_signal in ("Bull • VWAP Retest", "Bear • VWAP Retest"):
            return None

        short_sym = stock.get("symbol", "").replace("NSE:", "").replace("-EQ", "")
        premarket_focus = ai_copilot.get_premarket_briefing().get("focus_stocks", [])
        candle_closes = candle_aggregator.get_intraday_closes(short_sym)

        is_retest, _retest_msg, retest_metrics = _ti.evaluate_vwap_retest_setup(
            stock=stock,
            all_stocks=all_stocks or [],
            candle_closes=candle_closes,
            premarket_focus=premarket_focus,
        )

        if not is_retest:
            return None

        setup_type = retest_metrics.get("setup_type", "")
        direction = Direction.BULL if "BUY" in setup_type else Direction.BEAR
        ltp = stock.get("ltp", 0.0)
        trigger_price = stock.get("vwap", ltp)

        return SignalEvent(
            strategy_family=StrategyFamily.VWAP_RETEST,
            strategy_name="VWAP_RETEST",
            direction=direction,
            symbol=stock.get("symbol", ""),
            trigger_price=trigger_price,
            signal_time=now,
            metadata=retest_metrics,
        )
