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
from datetime import datetime, time as dt_time

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
def process_incoming_tick(state, short_sym: str, ltp: float, high: float, low: float,
                          prev_close: float = 0.0):
    """
    Update one stock's derived fields from a raw tick. `state` is the
    MarketState singleton; caller holds no lock — we take it here.

    `prev_close` lets the websocket feed supply the previous close (SymbolUpdate
    carries `prev_close_price`), so %change / RS / ranges work even when the REST
    backfill is unavailable (e.g. blocked by a corporate proxy).
    """
    with state.lock():
        stock = state.get_stock(short_sym)
        if stock is None:
            return

        if prev_close and not stock["prev_close"]:
            stock["prev_close"] = prev_close
        stock["ltp"] = ltp
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
        if signal:
            stock["signal"] = signal
            stock["signal_time"] = signal_time
