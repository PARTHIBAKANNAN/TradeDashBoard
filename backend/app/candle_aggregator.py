"""
Live-tick-derived opening-range data — replaces FYERS' REST Historical Data
API for this purpose, which is unreliable on this account (confirmed via
production logs: every history() call returns `-403 Additional permission
required. Please edit the app and regenerate access token`). That REST call
is what fyers_service.py's `_backfill_today_orb()`/`_backfill_orb_quality()`
use to populate `stock["orb"]`, `candle1_high/low`, and `two_sided_ok` — with
it broken, those fields never populate and no "Bull/Bear • C1-C4" signal can
ever fire (calculations.evaluate_orb() requires non-empty `orb` bounds).

This module derives the same fields directly from live ticks, which already
flow reliably through calculations.process_incoming_tick on every price
update — no REST dependency at all. Mirrors the client-side candle
aggregation already used for the mini-candlestick chart
(frontend/src/hooks/useMarketStream.js's processCandles), just server-side
and scoped to what the ORB signal engine needs (window high/low, not full
OHLC, except for the six 5-min opening-range candles where open/close matter
for the two-sided-range check).

Known limitation: this is purely tick-driven with no persistence, so a
backend restart between market open and 09:45 loses that day's opening-range
quality gate (`two_sided_ok`/`candle1_high/low` stay at their fail-closed
defaults for the rest of the day) — and a restart after an ORB candle's
window has closed loses that candle's boundaries permanently for the day.
The REST backfill in fyers_service.py is left in place as a best-effort
first attempt (harmless if it keeps failing; if FYERS' permission is ever
restored, it'll seed these fields too — this module's tick updates simply
layer on top without conflict either way).
"""

import asyncio
# The full opening-range quality gate (two-sided-range, candle1 extremes)
# needs all six 5-min candles from 09:15-09:45.  Hardcoded so that adding
# C0.5 (which ends at 09:30) as ORB_CANDLES[0] doesn't shift this boundary.
from datetime import datetime
from datetime import time as _dt_time

from .config import ORB_CANDLES

_OPENING_RANGE_END = _dt_time(9, 45)
_FIVE_MIN = 5

# symbol -> {bucket_start_minute: [open, high, low, close]}. Discarded once
# the opening range completes for that symbol — nothing here is needed again
# after `two_sided_ok`/`candle1_high/low` are set.
_opening_5min: dict[str, dict[int, list]] = {}

# symbol -> (bucket_date, bucket_minute, [open, high, low, close], delta,
# volume) — tracks the WHOLE session (09:15-15:30), kept deliberately
# SEPARATE from `_opening_5min` above so this addition (backtest groundwork,
# CVD, Smart Money Engine — see candle_history.py) can never regress the
# already-verified ORB/quality-gate logic. Persisted to Postgres each time a
# bucket completes. `delta` is the running tick-rule cumulative-volume-delta
# contribution for this bucket (see _tick_delta() below); `volume` is the
# unsigned traded quantity for the bucket (RVOL / Fresh Turnover input).
_day_candles: dict[str, tuple] = {}

# Per-symbol state for the tick-rule delta estimate, deliberately INDEPENDENT
# of calculations.py's own VWAP volume tracking (stock["vwap_cum_vol"]) even
# though both derive from the same underlying cumulative-day-volume field —
# same isolation rationale as _day_candles vs _opening_5min: a bug here must
# never be able to touch the already-verified VWAP/signal computation.
_last_ltp: dict[str, float] = {}
_last_volume: dict[str, int] = {}


def _five_min_bucket(now: datetime) -> int:
    return (now.hour * 60 + now.minute) // _FIVE_MIN * _FIVE_MIN


def _tick_delta(sym: str, ltp: float, volume: int) -> tuple[float, float]:
    """Returns (signed_delta, vol_delta) for this one tick. `vol_delta` is
    simply the traded quantity since the last tick (unsigned); `signed_delta`
    classifies it via the classic tick rule: uptick since the last tick ->
    buy-side (+), downtick -> sell-side (-), unchanged price -> 0. This is an
    approximation (no real bid/ask-crossed trade classification is available
    from FYERS' feed) — directionally useful, not a true institutional
    footprint read."""
    prev_ltp = _last_ltp.get(sym)
    prev_volume = _last_volume.get(sym, volume)
    vol_delta = max(0, volume - prev_volume)
    _last_ltp[sym] = ltp
    _last_volume[sym] = volume
    if prev_ltp is None or vol_delta == 0:
        return 0.0, float(vol_delta)
    if ltp > prev_ltp:
        return float(vol_delta), float(vol_delta)
    if ltp < prev_ltp:
        return -float(vol_delta), float(vol_delta)
    return 0.0, float(vol_delta)


def on_tick(stock: dict, ltp: float, now: datetime) -> None:
    """Called from calculations.process_incoming_tick for every tick, while
    the caller already holds MarketState's lock. Updates `stock["orb"]`
    live, and once the opening range (09:15-09:45) completes, seeds
    `candle1_high/low` and `two_sided_ok`."""
    now_t = now.time()
    # Do NOT break early — C0.5 (09:15-09:30) and C1 (09:15-09:45) overlap,
    # and both must track the live tick during their shared window.
    for name, start, end in ORB_CANDLES:
        if start <= now_t < end:
            bounds = stock["orb"].setdefault(name, {"high": ltp, "low": ltp})
            bounds["high"] = max(bounds["high"], ltp)
            bounds["low"] = min(bounds["low"], ltp)

    sym = stock["symbol"]
    _track_day_candle(sym, ltp, now, stock.get("volume") or 0)
    if now_t < _OPENING_RANGE_END:
        _update_opening_5min(sym, ltp, now)
    elif sym in _opening_5min:
        _finalize_opening_range(stock)


def _update_opening_5min(sym: str, ltp: float, now: datetime) -> None:
    bucket = _five_min_bucket(now)
    candles = _opening_5min.setdefault(sym, {})
    ohlc = candles.get(bucket)
    if ohlc is None:
        candles[bucket] = [ltp, ltp, ltp, ltp]  # open, high, low, close
    else:
        ohlc[1] = max(ohlc[1], ltp)
        ohlc[2] = min(ohlc[2], ltp)
        ohlc[3] = ltp


def _finalize_opening_range(stock: dict) -> None:
    from .calculations import has_two_sided_range

    candles = _opening_5min.pop(stock["symbol"], {})
    ordered = [candles[b] for b in sorted(candles)]
    if ordered:
        stock["candle1_high"] = ordered[0][1]
        stock["candle1_low"] = ordered[0][2]
    # has_two_sided_range expects [ts, open, high, low, close, volume] rows —
    # ts/volume aren't used by that check, pad with 0.
    rows = [[0, o, h, l, c, 0] for o, h, l, c in ordered]
    stock["two_sided_ok"] = has_two_sided_range(rows)


def _track_day_candle(sym: str, ltp: float, now: datetime, volume: int) -> None:
    """Backtest groundwork only — persists each completed 5-min candle (OHLC
    + tick-rule delta + traded volume) across the whole session, independent
    of the opening-range-specific logic above."""
    bucket = _five_min_bucket(now)
    today = now.date()
    tick_delta, vol_delta = _tick_delta(sym, ltp, volume)
    prev = _day_candles.get(sym)
    if prev is None or prev[0] != today or prev[1] != bucket:
        if prev is not None:
            _persist_bucket(sym, *prev)
        _day_candles[sym] = (today, bucket, [ltp, ltp, ltp, ltp], tick_delta, vol_delta)
    else:
        _, _, ohlc, delta, bucket_volume = prev
        ohlc[1] = max(ohlc[1], ltp)
        ohlc[2] = min(ohlc[2], ltp)
        ohlc[3] = ltp
        _day_candles[sym] = (today, bucket, ohlc, delta + tick_delta, bucket_volume + vol_delta)


def on_index_tick(sym: str, ltp: float, now: datetime) -> None:
    """Same day-candle tracking as on_tick(), for the benchmark index (NIFTY
    50) — no ORB/opening-range/quality-gate logic applies to it, and FYERS
    doesn't report a traded volume for the index, so volume is fixed at 0.
    The Smart Money Engine (smart_money.py) needs the index's own 5-min OHLC
    (today's open + latest close) for its Relative-Strength calculation."""
    _track_day_candle(sym, ltp, now, 0)


def _persist_bucket(
    sym: str, bucket_date, bucket_minute: int, ohlc: list, delta: float, volume: float = 0.0
) -> None:
    from . import order_monitor
    from .candle_history import persist_candle

    loop = order_monitor.get_loop()
    if loop is None:
        return  # paper trading (and its DB pool) not configured
    asyncio.run_coroutine_threadsafe(
        persist_candle(sym, bucket_date, bucket_minute, list(ohlc), delta, volume), loop
    )


def flush_all() -> None:
    """Persists every still-open bucket — called once at 15:30 IST market
    close (scheduler.py) so the last partial candle of the day isn't lost."""
    for sym, (bucket_date, bucket_minute, ohlc, delta, volume) in list(_day_candles.items()):
        _persist_bucket(sym, bucket_date, bucket_minute, ohlc, delta, volume)
    _day_candles.clear()


def get_in_progress(sym: str):
    """Read-only snapshot of the currently-forming (not yet persisted) bucket
    for `sym`, or None. Returns (bucket_date, bucket_minute, [open, high, low,
    close], delta, volume). Used by candle_query.py / smart_money.py to fill
    in the gap between the last completed candle_history row and "now" —
    never mutates _day_candles."""
    entry = _day_candles.get(sym)
    return (entry[0], entry[1], list(entry[2]), entry[3], entry[4]) if entry else None


def get_intraday_closes(sym: str) -> list[float]:
    """Return chronological list of today's 5m close prices for technical indicators."""
    closes: list[float] = []
    if sym in _opening_5min:
        for b_min in sorted(_opening_5min[sym].keys()):
            ohlc = _opening_5min[sym][b_min]
            closes.append(float(ohlc[3]))
    cur = _day_candles.get(sym)
    if cur and cur[2]:
        closes.append(float(cur[2][3]))
    return closes


def get_intraday_candles(sym: str) -> list[dict]:
    """Return chronological list of today's 5m candles with full OHLC for ATR & Swing calculations."""
    candles: list[dict] = []
    if sym in _opening_5min:
        for b_min in sorted(_opening_5min[sym].keys()):
            ohlc = _opening_5min[sym][b_min]
            candles.append(
                {
                    "open": float(ohlc[0]),
                    "high": float(ohlc[1]),
                    "low": float(ohlc[2]),
                    "close": float(ohlc[3]),
                    "minute": b_min,
                }
            )
    cur = _day_candles.get(sym)
    if cur and cur[2]:
        ohlc = cur[2]
        candles.append(
            {
                "open": float(ohlc[0]),
                "high": float(ohlc[1]),
                "low": float(ohlc[2]),
                "close": float(ohlc[3]),
                "volume": float(cur[4]),
                "minute": cur[1],
            }
        )
    return candles


def get_intraday_volumes(sym: str) -> list[float]:
    """Return chronological list of today's 5m candle volumes for technical volume acceleration."""
    candles = get_intraday_candles(sym)
    return [float(c.get("volume", 0.0)) for c in candles if "volume" in c]
