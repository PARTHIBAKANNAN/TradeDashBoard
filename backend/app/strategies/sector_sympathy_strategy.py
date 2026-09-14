from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time
from typing import Any

from ..momentum_score import industry_group, nifty_group
from ..strategy_base import Direction, SignalEvent, StrategyFamily
from ..technical_indicators import compute_adr_pct, compute_sector_breadth


class SectorSympathyStrategy:
    """Trades lagging sector constituents when sector momentum is confirmed.

    Entry Conditions (ALL must be true):
    1. Active window: 09:45 – 13:30 IST.
    2. Sector breadth >= 70% (advancing for bull, declining for bear).
    3. Sector constituent count >= 4 (statistical validity).
    4. Sector mean return absolute >= 0.40% (strong directional momentum).
    5. Confirmed leader in sector: at least one peer up/down >= 1.5x sector mean.
    6. Candidate stock is a genuine laggard:
       - Bull: 0 < pct_change < sector_mean * 0.6
       - Bear: sector_mean * 0.6 < pct_change < 0
    7. RS vs NIFTY >= 0 for Bull, <= 0 for Bear.
    8. LTP >= VWAP for Bull, LTP <= VWAP for Bear.
    9. ADR consumption <= 60% (has room to run).
    """

    @property
    def name(self) -> str:
        return "SECTOR_SYMPATHY"

    @property
    def family(self) -> StrategyFamily:
        return StrategyFamily.SECTOR_SYMPATHY

    @property
    def active_window(self) -> tuple[dt_time, dt_time]:
        return (dt_time(9, 45), dt_time(13, 30))

    def evaluate(
        self,
        stock: dict,
        now: datetime,
        *,
        all_stocks: list[dict] | None = None,
    ) -> SignalEvent | None:
        if not all_stocks:
            return None

        sym = stock.get("symbol", "")
        if not sym:
            return None

        current_signal = stock.get("signal")
        if current_signal in ("Bull • Sector Lag", "Bear • Sector Lag"):
            return None

        sector = nifty_group(industry_group(sym))
        if not sector or sector == "Other":
            return None

        # 1. Compute sector state & breadth
        breadth = compute_sector_breadth(all_stocks)
        sec_info = breadth.get(sector)
        if not sec_info:
            return None

        count = sec_info.get("count", 0)
        if count < 4:
            return None

        breadth_pct = sec_info.get("breadth_pct", 0.0)
        sec_mean = sec_info.get("mean_pct", 0.0)

        if abs(sec_mean) < 0.40:
            return None

        is_bull = sec_mean > 0
        if is_bull and breadth_pct < 70.0:
            return None
        elif not is_bull and breadth_pct > 30.0:
            return None

        # 2. Confirmed leader in sector
        sector_peers = [
            s
            for s in all_stocks
            if nifty_group(industry_group(s.get("symbol", ""))) == sector and s.get("symbol") != sym
        ]
        leader_threshold = abs(sec_mean) * 1.5
        has_leader = any(
            abs(p.get("pct_change", 0.0)) >= leader_threshold
            and ((p.get("pct_change", 0.0) > 0) == is_bull)
            for p in sector_peers
        )
        if not has_leader:
            return None

        # 3. Check if candidate is a genuine laggard
        pct = stock.get("pct_change", 0.0)
        if is_bull:
            if not (0 < pct < sec_mean * 0.6):
                return None
        else:
            if not (sec_mean * 0.6 < pct < 0):
                return None

        # 4. Quality gates: LTP vs VWAP, RS vs NIFTY, ADR headroom
        ltp = stock.get("ltp", 0.0)
        vwap = stock.get("vwap", 0.0)
        if not ltp or not vwap:
            return None

        if is_bull and ltp < vwap:
            return None
        if not is_bull and ltp > vwap:
            return None

        rs = stock.get("relative_strength", 0.0)
        if is_bull and rs < 0:
            return None
        if not is_bull and rs > 0:
            return None

        # ADR Headroom check
        adr_pct = compute_adr_pct(stock)
        today_high = stock.get("today_high", ltp)
        today_low = stock.get("today_low", ltp)
        prev_close = stock.get("prev_close", 1.0)
        if adr_pct > 0 and prev_close > 0:
            used_range_pct = ((today_high - today_low) / prev_close) * 100.0
            if used_range_pct > adr_pct * 0.60:
                return None  # >60% ADR already consumed

        direction = Direction.BULL if is_bull else Direction.BEAR

        return SignalEvent(
            strategy_family=StrategyFamily.SECTOR_SYMPATHY,
            strategy_name="Sector Lag",
            direction=direction,
            symbol=sym,
            trigger_price=vwap,
            signal_time=now,
            metadata={
                "sector": sector,
                "sector_mean": sec_mean,
                "sector_breadth": breadth_pct,
                "stock_pct": pct,
            },
        )
