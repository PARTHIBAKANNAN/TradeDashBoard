"""
Thread-safe in-memory market state.

The Fyers websocket callback runs on a background thread while the SSE
generator reads on the asyncio loop, so every mutation / snapshot is guarded
by a single lock. State is intentionally plain dicts for cheap JSON packaging.
"""

import threading
from typing import Optional

from .config import BENCHMARK_SYMBOL, WATCHLIST, short_symbol


class MarketState:
    def __init__(self):
        self._lock = threading.RLock()
        # market_open drives the "Live"/"Closed" indicator on the frontend.
        self.market_open: bool = False
        self.last_update_ts: Optional[str] = None

        # Benchmark (NIFTY 50)
        self.nifty = {
            "symbol": "NIFTY50",
            "ltp": 0.0,
            "prev_close": 0.0,
            "pct_change": 0.0,
        }

        # Per-stock records keyed by the short symbol (e.g. "TCS").
        self.stocks: dict[str, dict] = {}
        for fy_symbol, sector in WATCHLIST.items():
            self.stocks[short_symbol(fy_symbol)] = {
                "symbol": short_symbol(fy_symbol),
                "fy_symbol": fy_symbol,
                "sector": sector,
                "prev_close": 0.0,
                "yesterday_low": 0.0,
                "yesterday_high": 0.0,
                "today_low": 0.0,
                "today_high": 0.0,
                "ltp": 0.0,
                "pct_change": 0.0,
                "volume": 0,
                "upper_ckt": 0.0,
                "lower_ckt": 0.0,
                "tot_buy_qty": 0,
                "tot_sell_qty": 0,
                "day_range_pos": 0.0,
                "relative_strength": 0.0,
                # ORB candle boundaries, filled by REST backfill / live aggregation.
                "orb": {},  # {"C1": {"high": .., "low": ..}, ...}
                # First 5-min candle (9:15-9:20) high/low — the day's-extreme
                # reference for calculations.first_candle_extreme_intact().
                "candle1_high": 0.0,
                "candle1_low": 0.0,
                # Whether the 9:15-9:45 opening range has both a red and green
                # candle (calculations.has_two_sided_range); gates "Bull/Bear • C1"
                # together with first_candle_extreme_intact().
                "two_sided_ok": False,
                "signal": "None",
                "signal_time": "",
            }

    # ---- context-managed access ----
    def lock(self):
        return self._lock

    def get_stock(self, short_sym: str) -> Optional[dict]:
        return self.stocks.get(short_sym)

    def set_nifty(self, ltp=None, prev_close=None):
        with self._lock:
            if prev_close is not None:
                self.nifty["prev_close"] = prev_close
            if ltp is not None:
                self.nifty["ltp"] = ltp
            pc = self.nifty["prev_close"]
            if pc:
                self.nifty["pct_change"] = round((self.nifty["ltp"] - pc) / pc * 100, 2)


# Singleton used across the app.
market_state = MarketState()
