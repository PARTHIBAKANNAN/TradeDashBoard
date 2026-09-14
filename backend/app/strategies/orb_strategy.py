from __future__ import annotations

from datetime import datetime
from datetime import time as dt_time
from typing import Any

from .. import config as _cfg
from ..candle_aggregator import get_intraday_candles
from ..config import ORB_CANDLES
from ..strategy_base import Direction, SignalEvent, StrategyFamily


def completed_candles(now: dt_time) -> list[str]:
    """Names of ORB candles whose window has fully elapsed by `now`."""
    return [name for name, _start, end in ORB_CANDLES if now >= end]


def first_candle_extreme_intact(
    bullish: bool,
    candle1_high: float,
    candle1_low: float,
    today_high: float,
    today_low: float,
) -> bool:
    """
    "First candle made the extreme" trend-cleanliness rule, checked live
    against the whole day so far (not just the opening 30 min):
      - Bullish: candle-1's low must still be the day's low so far (never
        undercut by any later candle/tick).
      - Bearish: candle-1's high must still be the day's high so far (never
        overtaken).
    Fails closed (False) if candle-1's reference value hasn't been backfilled
    yet (still at its 0.0 default) — no data means not qualified.
    """
    if bullish:
        return bool(candle1_low) and today_low >= candle1_low
    return bool(candle1_high) and today_high <= candle1_high


def has_two_sided_range(candles: list) -> bool:
    """
    Breakout-quality rule: given the six 9:15-9:45 5-min candles (each
    `[ts, open, high, low, close, ...]`, FYERS' raw shape, already
    filtered/sorted to just that window), at least one must be red
    (close < open) and one green (close > open) — rules out a stock that
    just ran straight up/down with no two-sided trade at all.

    Returns False if fewer than 6 candles are given (incomplete data).
    """
    if len(candles) < 6:
        return False
    has_red = any(c[4] < c[1] for c in candles)
    has_green = any(c[4] > c[1] for c in candles)
    return has_red and has_green


def evaluate_orb(
    orb_bounds: dict,
    ltp: float,
    now_ist: datetime,
    current_signal: str | None,
) -> tuple[str | None, str | None]:
    """
    Given completed candle bounds ({"C1": {"high","low"}, ...}) and the live
    LTP, return (signal, signal_time) if a NEW breakout is triggered, else
    (None, None). The most recent completed candle whose boundary is breached
    wins, so later structural breaks supersede earlier ones.
    """
    now_t = now_ist.time()
    ready = completed_candles(now_t)
    for name in reversed(ready):
        bounds = orb_bounds.get(name)
        if not bounds:
            continue
        if ltp > bounds["high"]:
            new_signal = f"Bull • {name}"
        elif ltp < bounds["low"]:
            new_signal = f"Bear • {name}"
        else:
            continue
        if new_signal != current_signal:
            return new_signal, now_ist.strftime("%H:%M")
        return None, None
    return None, None


class OrbStrategy:
    """Opening Range Breakout (ORB) Strategy covering C0.5, C1, C2, C3, C4."""

    @property
    def name(self) -> str:
        return "ORB_BREAKOUT"

    @property
    def family(self) -> StrategyFamily:
        return StrategyFamily.ORB_BREAKOUT

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
        now_t = now.time()
        session_minute = (now.hour - 9) * 60 + (now.minute - 15)
        scan_cutoff = getattr(_cfg, "MARKET_SCAN_END_MINUTE", 105)

        if session_minute > scan_cutoff:
            return None

        ltp = stock.get("ltp", 0.0)
        current_signal = stock.get("signal")
        orb_bounds = stock.get("orb", {})
        ready = completed_candles(now_t)

        candidate_name: str | None = None
        direction: Direction | None = None
        trigger_price: float = ltp
        candidate_bounds: dict[str, Any] = {}

        for name in reversed(ready):
            bounds = orb_bounds.get(name)
            if not bounds:
                continue
            if ltp > bounds["high"]:
                new_sig = f"Bull • {name}"
                dir_val = Direction.BULL
                trig = bounds["high"]
            elif ltp < bounds["low"]:
                new_sig = f"Bear • {name}"
                dir_val = Direction.BEAR
                trig = bounds["low"]
            else:
                continue

            if new_sig == current_signal:
                return None  # already in this signal state

            candidate_name = name
            direction = dir_val
            trigger_price = trig
            candidate_bounds = bounds
            break

        if candidate_name is None or direction is None:
            return None

        signal_str = f"{direction.value} • {candidate_name}"
        short_sym = stock.get("symbol", "").replace("NSE:", "").replace("-EQ", "")

        # ── C0.5 Early-Fire Quality Gate ──────────────────────────────────────
        if candidate_name == "C0.5":
            is_bull_c05 = direction == Direction.BULL
            is_strong_trend = abs(stock.get("relative_strength", 0.0)) >= 0.60
            qualified = (
                first_candle_extreme_intact(
                    is_bull_c05,
                    stock.get("candle1_high", 0),
                    stock.get("candle1_low", 0),
                    stock.get("today_high", ltp),
                    stock.get("today_low", ltp),
                )
                if stock.get("candle1_high")
                else is_strong_trend
            )
            if qualified:
                intra_candles = get_intraday_candles(short_sym)
                if intra_candles:
                    last_c = intra_candles[-1]
                    c_range = last_c["high"] - last_c["low"]
                    if c_range > 0:
                        close_pos = (last_c["close"] - last_c["low"]) / c_range
                        if is_bull_c05 and close_pos < 0.80:
                            qualified = False
                        elif not is_bull_c05 and close_pos > 0.20:
                            qualified = False
            if not qualified and not is_strong_trend:
                return None

        # ── C1 Quality Gate (original) ────────────────────────────────────────
        elif candidate_name == "C1":
            prev_dir = (
                "Bull"
                if current_signal and "Bull" in current_signal
                else ("Bear" if current_signal and "Bear" in current_signal else None)
            )
            curr_dir = direction.value
            if current_signal and "C0.5" in current_signal and prev_dir == curr_dir:
                return None  # C0.5 -> C1 deduplication

            is_strong_trend = abs(stock.get("relative_strength", 0.0)) >= 0.80
            range_ok = stock.get("two_sided_ok", False) or is_strong_trend
            qualified = range_ok and first_candle_extreme_intact(
                direction == Direction.BULL,
                stock.get("candle1_high", 0.0),
                stock.get("candle1_low", 0.0),
                stock.get("today_high", ltp),
                stock.get("today_low", ltp),
            )
            if not qualified:
                return None

        return SignalEvent(
            strategy_family=StrategyFamily.ORB_BREAKOUT,
            strategy_name=candidate_name,
            direction=direction,
            symbol=stock.get("symbol", ""),
            trigger_price=trigger_price,
            signal_time=now,
            metadata={"bounds": candidate_bounds, "raw_signal": signal_str},
        )
