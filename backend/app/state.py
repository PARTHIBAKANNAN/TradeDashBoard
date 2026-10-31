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
            "change": 0.0,
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
                "open": 0.0,
                "open_eq_signal": None,
                "rvol": 1.0,
                "is_rvol_shocker": False,
                "is_hod_squeeze": False,
                "is_lod_breakdown": False,
                "vwap_dist_pct": 0.0,
                "is_vwap_retest": False,
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
                # Volume-weighted average price, built live from ticks (see
                # calculations.update_vwap) — cum_pv/cum_vol are the running
                # accumulators, vwap is the derived value consumed elsewhere.
                "vwap_cum_pv": 0.0,
                "vwap_cum_vol": 0,
                "vwap": 0.0,
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
                # Live order-book imbalance from the DepthUpdate socket
                # (depth_manager.py): bid_value − ask_value, where each value
                # is Σ(price × quantity) across the 5 book levels received.
                # Positive → more rupee-value queued on the buy side.
                # Zero when the symbol is not on the depth subscription.
                "depth_delta": 0.0,
                # Alice Blue Institutional Metrics & Order Flow Engine
                "ap": 0.0,  # Official Exchange Average Traded Price (VWAP)
                "tbq": 0,  # Total Buy Quantity (cumulative market depth)
                "tsq": 0,  # Total Sell Quantity (cumulative market depth)
                "oi": 0,  # Current Open Interest (if F&O stock)
                "oi_pct": 0.0,  # Intraday OI change percentage
                "tick_delta": 0.0,  # Current 5m candle order flow delta
                "cvd": 0.0,  # Cumulative Volume Delta from 09:15
                "book_imbalance": 0.0,  # (tbq - tsq) / (tbq + tsq) in range [-1.0, 1.0]
                "strategy_score": 0.0,  # Alpha Composite Score (0 to 100)
                "strategy_name": "",  # Name of qualifying strategy
            }

    # ---- context-managed access ----
    def lock(self):
        return self._lock

    def reset_signals(self):
        """Reset signal indicators across all tracked stocks for a new daily trading session."""
        with self._lock:
            for stock in self.stocks.values():
                stock["signal"] = "None"
                stock["signal_time"] = ""
                stock["orb"] = {}
                stock["candle1_high"] = 0.0
                stock["candle1_low"] = 0.0
                stock["two_sided_ok"] = False
                stock["depth_delta"] = 0.0
                stock["tick_delta"] = 0.0
                stock["cvd"] = 0.0
                stock["strategy_score"] = 0.0
                stock["strategy_name"] = ""
                # Intraday-derived ranking columns — zeroed so the Ranking tab
                # shows a clean slate before the first live tick of the new day
                # rather than carrying yesterday's RS / % change values forward.
                stock["relative_strength"] = 0.0
                stock["pct_change"] = 0.0

    def get_stock(self, short_sym: str) -> Optional[dict]:
        return self.stocks.get(short_sym)

    def set_nifty(self, ltp=None, prev_close=None):
        with self._lock:
            if prev_close and prev_close > 0:
                self.nifty["prev_close"] = prev_close
            if ltp is not None:
                self.nifty["ltp"] = ltp
                if not self.nifty["prev_close"]:
                    self.nifty["prev_close"] = ltp
            pc = self.nifty.get("prev_close")
            if pc and self.nifty.get("ltp"):
                self.nifty["change"] = round(self.nifty["ltp"] - pc, 2)
                self.nifty["pct_change"] = round((self.nifty["ltp"] - pc) / pc * 100, 2)


# Singleton used across the app.
market_state = MarketState()
