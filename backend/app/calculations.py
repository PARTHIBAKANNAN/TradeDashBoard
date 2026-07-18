"""
Pure mathematical engines described in the spec:

  A. Intraday Relative Strength (IRS) vs NIFTY 50
  B. 30-minute Opening Range Breakout (ORB) signal engine (C1-C4)
  C. Normalized dual-range coordinate mapper (0-100%)
  D. Day range position (%)

Every function here is deterministic and side-effect free so it can be unit
tested in isolation. `process_incoming_tick` is the one place that mutates the
shared state, and it delegates all arithmetic to these helpers.
"""

from datetime import datetime
from datetime import time as dt_time

from .config import IST, ORB_CANDLES


# ---------- A. Intraday Relative Strength ----------
def intraday_relative_strength(stock_pct_change: float, index_pct_change: float) -> float:
    """IRS = %Δ stock − %Δ index (both vs previous close)."""
    return round(stock_pct_change - index_pct_change, 2)


def pct_change(ltp: float, prev_close: float) -> float:
    if not prev_close:
        return 0.0
    return round((ltp - prev_close) / prev_close * 100, 2)


# ---------- C. Normalized dual-range coordinate mapper ----------
def _x(price: float, g_min: float, g_max: float) -> float:
    denom = (g_max - g_min) or 1.0
    return round((price - g_min) / denom * 100, 2)


def range_map(y_low, y_high, t_low, t_high, ltp) -> dict:
    """
    Map yesterday's + today's ranges and the LTP onto a shared 0-100% scale.
    Returns coordinates plus the raw prices the UI labels the bar with.
    """
    g_min = min(y_low, t_low)
    g_max = max(y_high, t_high)
    return {
        "yesterday": {
            "low": _x(y_low, g_min, g_max),
            "high": _x(y_high, g_min, g_max),
            "raw_low": y_low,
            "raw_high": y_high,
        },
        "today": {
            "low": _x(t_low, g_min, g_max),
            "high": _x(t_high, g_min, g_max),
            "raw_low": t_low,
            "raw_high": t_high,
        },
        "ltp_pos": _x(ltp, g_min, g_max),
    }


# ---------- D. Day range position (%) ----------
def day_range_position(ltp: float, t_low: float, t_high: float) -> float:
    span = t_high - t_low
    if span <= 0:
        return 0.0
    return round((ltp - t_low) / span * 100, 2)


# ---------- B. Opening Range Breakout engine ----------
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


def first_candle_extreme_intact(
    bullish: bool, candle1_high: float, candle1_low: float, today_high: float, today_low: float
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


def completed_candles(now: dt_time) -> list[str]:
    """Names of ORB candles whose window has fully elapsed by `now`."""
    return [name for name, _start, end in ORB_CANDLES if now >= end]


def evaluate_orb(orb_bounds: dict, ltp: float, now_ist: datetime, current_signal: str):
    """
    Given completed candle bounds ({"C1": {"high","low"}, ...}) and the live
    LTP, return (signal, signal_time) if a NEW breakout is triggered, else
    (None, None). The most recent completed candle whose boundary is breached
    wins, so later structural breaks supersede earlier ones.
    """
    now_t = now_ist.time()
    ready = completed_candles(now_t)
    # Evaluate newest completed candle first so it takes precedence.
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
        return None, None  # already in this signal state
    return None, None


# ---------- Tick processor (the single mutation point) ----------
def process_incoming_tick(
    state,
    short_sym: str,
    ltp: float,
    high: float,
    low: float,
    prev_close: float = 0.0,
    volume: int = 0,
    upper_ckt: float = 0.0,
    lower_ckt: float = 0.0,
    tot_buy_qty: int = 0,
    tot_sell_qty: int = 0,
):
    """
    Update one stock's derived fields from a raw tick. `state` is the
    MarketState singleton; caller holds no lock — we take it here.

    `prev_close` lets the websocket feed supply the previous close (SymbolUpdate
    carries `prev_close_price`), so %change / RS / ranges work even when the REST
    backfill is unavailable (e.g. blocked by a corporate proxy).

    `volume` is today's cumulative traded quantity (SymbolUpdate's
    `vol_traded_today`), used for the treemap's traded-value sizing.

    `upper_ckt`/`lower_ckt` are the exchange circuit limits and `tot_buy_qty`/
    `tot_sell_qty` the aggregate outstanding order quantities — both carried
    directly on SymbolUpdate ticks, used by the circuit-proximity and
    buy/sell-pressure Insights widgets.
    """
    with state.lock():
        stock = state.get_stock(short_sym)
        if stock is None:
            return

        if prev_close and not stock["prev_close"]:
            stock["prev_close"] = prev_close
        stock["ltp"] = ltp
        if volume:
            stock["volume"] = volume
        if upper_ckt:
            stock["upper_ckt"] = upper_ckt
        if lower_ckt:
            stock["lower_ckt"] = lower_ckt
        if tot_buy_qty:
            stock["tot_buy_qty"] = tot_buy_qty
        if tot_sell_qty:
            stock["tot_sell_qty"] = tot_sell_qty
        # Guard against zeroed backfill: only expand today's range once seeded.
        if high:
            stock["today_high"] = max(stock["today_high"] or high, high)
        if low:
            stock["today_low"] = min(stock["today_low"] or low, low)

        stock["pct_change"] = pct_change(ltp, stock["prev_close"])
        stock["day_range_pos"] = day_range_position(ltp, stock["today_low"], stock["today_high"])
        stock["relative_strength"] = intraday_relative_strength(
            stock["pct_change"], state.nifty["pct_change"]
        )

        now_ist = datetime.now(IST)
        signal, signal_time = evaluate_orb(stock["orb"], ltp, now_ist, stock["signal"])
        # The breakout-quality rules apply specifically to the 30-min opening-
        # range breakout (both directions), not later C2-C4 structural breaks:
        #   Filter 1: candle-1's low (bull) / high (bear) still the day's
        #             extreme so far.
        #   Rule 3:   at least one red and one green candle in the opening range.
        if signal in ("Bull • C1", "Bear • C1"):
            qualified = stock["two_sided_ok"] and first_candle_extreme_intact(
                signal == "Bull • C1",
                stock["candle1_high"],
                stock["candle1_low"],
                stock["today_high"],
                stock["today_low"],
            )
            if not qualified:
                signal, signal_time = None, None
        if signal:
            stock["signal"] = signal
            stock["signal_time"] = signal_time
